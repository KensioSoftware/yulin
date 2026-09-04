import { CreateKeyCommand } from "@aws-sdk/client-kms";
import {
  ActivateKeySigningKeyCommand,
  CreateHostedZoneCommand,
  CreateKeySigningKeyCommand,
  DeactivateKeySigningKeyCommand,
  DeleteKeySigningKeyCommand,
  DisableHostedZoneDNSSECCommand,
  EnableHostedZoneDNSSECCommand,
  GetDNSSECCommand,
} from "@aws-sdk/client-route-53";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertNotEqual,
  assertStringLength,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  simRoute53DnssecFixture,
  type SimRoute53DnssecFixture,
} from "../../../../../test/route53/dnssec-fixture.js";

async function signedZone(): Promise<SimRoute53DnssecFixture> {
  const fixture = await simRoute53DnssecFixture();

  await fixture.simAws.route53().createKeySigningKey(
    new CreateKeySigningKeyCommand({
      CallerReference: "ksk",
      HostedZoneId: fixture.hostedZoneId,
      KeyManagementServiceArn: fixture.kmsKeyArn,
      Name: "zone_signing_key",
      Status: "ACTIVE",
    }),
  );
  await fixture.simAws.route53().enableHostedZoneDnssec(
    new EnableHostedZoneDNSSECCommand({
      HostedZoneId: fixture.hostedZoneId,
    }),
  );

  return fixture;
}

describe("Route53 DNSSEC", () => {
  it("creates a key signing key from a KMS key", async () => {
    // Given a hosted zone and an ECC_NIST_P256 signing key.
    const fixture = await simRoute53DnssecFixture();

    // When a key signing key is created on the zone.
    const created = await fixture.simAws.route53().createKeySigningKey(
      new CreateKeySigningKeyCommand({
        CallerReference: "ksk",
        HostedZoneId: fixture.hostedZoneId,
        KeyManagementServiceArn: fixture.kmsKeyArn,
        Name: "zone_signing_key",
        Status: "ACTIVE",
      }),
    );
    assertNonNullable(created.KeySigningKey);

    // Then it carries the DNSSEC parameters a registrar needs, derived from
    // the KMS key rather than invented.
    assertIdentical(created.KeySigningKey.Name, "zone_signing_key");
    assertIdentical(created.KeySigningKey.KmsArn, fixture.kmsKeyArn);
    assertIdentical(created.KeySigningKey.Flag, 257);
    assertIdentical(
      created.KeySigningKey.SigningAlgorithmMnemonic,
      "ECDSAP256SHA256",
    );
    assertIdentical(created.KeySigningKey.SigningAlgorithmType, 13);
    assertIdentical(created.KeySigningKey.DigestAlgorithmMnemonic, "SHA-256");
    assertIdentical(created.KeySigningKey.DigestAlgorithmType, 2);
    assertIdentical(created.KeySigningKey.Status, "ACTIVE");
  });

  it("derives DS record fields that agree with the public key", async () => {
    // Given a zone with a key signing key.
    const fixture = await signedZone();

    // When the zone's DNSSEC is read.
    const dnssec = await fixture.simAws
      .route53()
      .getDnssec(new GetDNSSECCommand({ HostedZoneId: fixture.hostedZoneId }));
    const keySigningKey = dnssec.KeySigningKeys?.[0];
    assertNonNullable(keySigningKey);

    // Then the DS and DNSKEY records are assembled from the same key tag,
    // digest and public key the key reports on its own.
    const digestValue = keySigningKey.DigestValue;
    assertNonNullable(digestValue);

    assertIdentical(
      keySigningKey.DSRecord,
      `${String(keySigningKey.KeyTag)} 13 2 ${digestValue}`,
    );
    assertIdentical(
      keySigningKey.DNSKEYRecord,
      `257 3 13 ${keySigningKey.PublicKey}`,
    );

    // And the digest is a SHA-256 one, in the uppercase hex a registrar takes.
    assertStringLength(digestValue, 64);
    assertIdentical(digestValue, digestValue.toUpperCase());
  });

  it("gives two zones different DS records for different keys", async () => {
    // Given two zones, each with a key signing key on its own KMS key.
    const first = await signedZone();
    const second = await signedZone();

    // When both zones' DNSSEC is read.
    const firstDnssec = await first.simAws
      .route53()
      .getDnssec(new GetDNSSECCommand({ HostedZoneId: first.hostedZoneId }));
    const secondDnssec = await second.simAws
      .route53()
      .getDnssec(new GetDNSSECCommand({ HostedZoneId: second.hostedZoneId }));

    // Then the DS records differ, because the cryptography behind them is
    // real rather than a fixed string.
    assertNotEqual(
      firstDnssec.KeySigningKeys?.[0]?.DSRecord,
      secondDnssec.KeySigningKeys?.[0]?.DSRecord,
    );
  });

  it("reports a signed zone", async () => {
    // Given a zone with signing enabled.
    const fixture = await signedZone();

    // When its DNSSEC is read.
    const dnssec = await fixture.simAws
      .route53()
      .getDnssec(new GetDNSSECCommand({ HostedZoneId: fixture.hostedZoneId }));

    // Then it is signing, with the one key signing key on it.
    assertIdentical(dnssec.Status?.ServeSignature, "SIGNING");
    assertArrayLength(dnssec.KeySigningKeys ?? [], 1);
  });

  it("reports an unsigned zone", async () => {
    // Given a zone with no DNSSEC at all.
    const fixture = await simRoute53DnssecFixture();

    // When its DNSSEC is read.
    const dnssec = await fixture.simAws
      .route53()
      .getDnssec(new GetDNSSECCommand({ HostedZoneId: fixture.hostedZoneId }));

    // Then it says so rather than failing.
    assertIdentical(dnssec.Status?.ServeSignature, "NOT_SIGNING");
    assertArrayEmpty(dnssec.KeySigningKeys ?? []);
  });

  it("stops signing when DNSSEC is disabled", async () => {
    // Given a signed zone.
    const fixture = await signedZone();

    // When signing is turned off.
    await fixture.simAws.route53().disableHostedZoneDnssec(
      new DisableHostedZoneDNSSECCommand({
        HostedZoneId: fixture.hostedZoneId,
      }),
    );

    // Then the zone is no longer signing, and keeps its key signing key.
    const dnssec = await fixture.simAws
      .route53()
      .getDnssec(new GetDNSSECCommand({ HostedZoneId: fixture.hostedZoneId }));

    assertIdentical(dnssec.Status?.ServeSignature, "NOT_SIGNING");
    assertArrayLength(dnssec.KeySigningKeys ?? [], 1);
  });

  it("deactivates and deletes a key signing key", async () => {
    // Given a zone with an active key signing key.
    const fixture = await signedZone();
    const keySigningKey = {
      HostedZoneId: fixture.hostedZoneId,
      Name: "zone_signing_key",
    };

    // When the key is deactivated and then deleted.
    await fixture.simAws
      .route53()
      .deactivateKeySigningKey(
        new DeactivateKeySigningKeyCommand(keySigningKey),
      );
    await fixture.simAws
      .route53()
      .deleteKeySigningKey(new DeleteKeySigningKeyCommand(keySigningKey));

    // Then the zone has none left.
    const dnssec = await fixture.simAws
      .route53()
      .getDnssec(new GetDNSSECCommand({ HostedZoneId: fixture.hostedZoneId }));

    assertArrayEmpty(dnssec.KeySigningKeys ?? []);
  });

  it("activates a key signing key created inactive", async () => {
    // Given a zone with an inactive key signing key.
    const fixture = await simRoute53DnssecFixture();
    await fixture.simAws.route53().createKeySigningKey(
      new CreateKeySigningKeyCommand({
        CallerReference: "ksk",
        HostedZoneId: fixture.hostedZoneId,
        KeyManagementServiceArn: fixture.kmsKeyArn,
        Name: "zone_signing_key",
        Status: "INACTIVE",
      }),
    );

    // When the key is activated.
    await fixture.simAws.route53().activateKeySigningKey(
      new ActivateKeySigningKeyCommand({
        HostedZoneId: fixture.hostedZoneId,
        Name: "zone_signing_key",
      }),
    );

    // Then it reports as active, and the zone can be signed with it.
    await fixture.simAws.route53().enableHostedZoneDnssec(
      new EnableHostedZoneDNSSECCommand({
        HostedZoneId: fixture.hostedZoneId,
      }),
    );
    const dnssec = await fixture.simAws
      .route53()
      .getDnssec(new GetDNSSECCommand({ HostedZoneId: fixture.hostedZoneId }));

    assertIdentical(dnssec.KeySigningKeys?.[0]?.Status, "ACTIVE");
    assertIdentical(dnssec.Status?.ServeSignature, "SIGNING");
  });

  it("keeps DNSSEC state apart between hosted zones", async () => {
    // Given a simulation with a signed zone.
    const fixture = await signedZone();
    const simAws = fixture.simAws;

    // When a second zone is created in the same account.
    const other = await simAws.route53().createHostedZone(
      new CreateHostedZoneCommand({
        Name: "other.example.test",
        CallerReference: "other",
      }),
    );
    assertNonNullable(other.HostedZone?.Id);

    // Then the second zone is unsigned, since signing belongs to a zone rather
    // than to the account.
    const dnssec = await simAws
      .route53()
      .getDnssec(new GetDNSSECCommand({ HostedZoneId: other.HostedZone.Id }));

    assertIdentical(dnssec.Status?.ServeSignature, "NOT_SIGNING");
  });

  it("resolves a KMS key from another region", async () => {
    // Given a hosted zone, and a signing key in a region of its own. Route53
    // is account scoped and KMS is not, which is what the key ARN carries.
    const simAws = new SimAws();
    const created = await simAws.route53().createHostedZone(
      new CreateHostedZoneCommand({
        Name: "example.test",
        CallerReference: "zone",
      }),
    );
    assertNonNullable(created.HostedZone?.Id);

    const key = await simAws
      .region("us-east-1")
      .kms()
      .createKey(
        new CreateKeyCommand({
          KeySpec: "ECC_NIST_P256",
          KeyUsage: "SIGN_VERIFY",
        }),
      );
    assertNonNullable(key.KeyMetadata);

    // When a key signing key is created on that key.
    const keySigningKey = await simAws.route53().createKeySigningKey(
      new CreateKeySigningKeyCommand({
        CallerReference: "ksk",
        HostedZoneId: created.HostedZone.Id,
        KeyManagementServiceArn: key.KeyMetadata.Arn,
        Name: "zone_signing_key",
        Status: "ACTIVE",
      }),
    );

    // Then the key is found, wherever in the simulation it lives.
    assertIdentical(keySigningKey.KeySigningKey?.KmsArn, key.KeyMetadata.Arn);
  });
});

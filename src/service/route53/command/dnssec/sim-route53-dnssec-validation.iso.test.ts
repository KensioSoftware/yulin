import { CreateKeyCommand, DisableKeyCommand } from "@aws-sdk/client-kms";
import {
  CreateKeySigningKeyCommand,
  DeleteHostedZoneCommand,
  DeleteKeySigningKeyCommand,
  DisableHostedZoneDNSSECCommand,
  EnableHostedZoneDNSSECCommand,
  GetDNSSECCommand,
} from "@aws-sdk/client-route-53";
import {
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimRoute53 } from "../../sim-route53.js";
import {
  SimRoute53DnssecNotFound,
  SimRoute53InvalidKeySigningKeyStatus,
  SimRoute53InvalidKmsArn,
  SimRoute53KeySigningKeyAlreadyExists,
  SimRoute53NoActiveKeySigningKey,
  SimRoute53NoSuchHostedZone,
  SimRoute53NoSuchKeySigningKey,
} from "../../error/sim-route53.error.js";
import {
  simKmsSigningKeyArn,
  simRoute53DnssecFixture,
  type SimRoute53DnssecFixture,
} from "../../../../../test/route53/dnssec-fixture.js";

async function withKeySigningKey(
  fixture: SimRoute53DnssecFixture,
  Status = "ACTIVE",
): Promise<void> {
  await fixture.simAws.route53().createKeySigningKey(
    new CreateKeySigningKeyCommand({
      CallerReference: "ksk",
      HostedZoneId: fixture.hostedZoneId,
      KeyManagementServiceArn: fixture.kmsKeyArn,
      Name: "zone_signing_key",
      Status,
    }),
  );
}

describe("Route53 DNSSEC validation", () => {
  it("refuses a KMS key that is not a signing key", async () => {
    // Given a hosted zone and a symmetric KMS key.
    const fixture = await simRoute53DnssecFixture();
    const symmetric = await fixture.simAws
      .kms()
      .createKey(new CreateKeyCommand({}));
    assertNonNullable(symmetric.KeyMetadata);

    // When a key signing key is built on it.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().createKeySigningKey(
        new CreateKeySigningKeyCommand({
          CallerReference: "ksk",
          HostedZoneId: fixture.hostedZoneId,
          KeyManagementServiceArn: symmetric.KeyMetadata?.Arn,
          Name: "zone_signing_key",
          Status: "ACTIVE",
        }),
      ),
    );

    // Then it is refused here, rather than on the deployment.
    assertInstanceOf(error, SimRoute53InvalidKmsArn);
    assertStringIncludes(
      error.message,
      "needs a ECC_NIST_P256 SIGN_VERIFY key",
    );
  });

  it("refuses a KMS key that is disabled", async () => {
    // Given a hosted zone whose signing key has been disabled.
    const fixture = await simRoute53DnssecFixture();
    await fixture.simAws
      .kms()
      .disableKey(new DisableKeyCommand({ KeyId: fixture.kmsKeyArn }));

    // When a key signing key is built on it.
    const error = await assertThrowsErrorAsync(async () =>
      withKeySigningKey(fixture),
    );

    // Then it is refused, as real Route53 refuses it.
    assertInstanceOf(error, SimRoute53InvalidKmsArn);
    assertStringIncludes(error.message, "is not enabled");
  });

  it("refuses a KMS key no simulated KMS holds", async () => {
    // Given a hosted zone.
    const fixture = await simRoute53DnssecFixture();

    // When a key signing key names a key that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().createKeySigningKey(
        new CreateKeySigningKeyCommand({
          CallerReference: "ksk",
          HostedZoneId: fixture.hostedZoneId,
          KeyManagementServiceArn:
            "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-4000-8000-000000000000",
          Name: "zone_signing_key",
          Status: "ACTIVE",
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimRoute53InvalidKmsArn);
  });

  it("refuses an ARN that does not name a KMS key", async () => {
    // Given a hosted zone.
    const fixture = await simRoute53DnssecFixture();

    // When a key signing key names something that is not a KMS ARN.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().createKeySigningKey(
        new CreateKeySigningKeyCommand({
          CallerReference: "ksk",
          HostedZoneId: fixture.hostedZoneId,
          KeyManagementServiceArn: "arn:aws:s3:::a-bucket",
          Name: "zone_signing_key",
          Status: "ACTIVE",
        }),
      ),
    );

    // Then it is refused, rather than the lookup being tried anyway.
    assertInstanceOf(error, SimRoute53InvalidKmsArn);
  });

  it("refuses a key signing key with no simulated KMS to check", async () => {
    // Given a standalone simulated Route53, with no KMS wired to it.
    const route53 = new SimRoute53();
    const zone = route53.registerHostedZone({
      id: "Z00000000000000000000A",
      name: "example.test",
    });

    // When a key signing key is created on it.
    const error = await assertThrowsErrorAsync(async () =>
      route53.createKeySigningKey({
        input: {
          HostedZoneId: zone.id,
          KeyManagementServiceArn:
            "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-4000-8000-000000000000",
          Name: "zone_signing_key",
          Status: "ACTIVE",
        },
      }),
    );

    // Then it says so, rather than reporting the key as missing.
    assertInstanceOf(error, SimRoute53InvalidKmsArn);
    assertStringIncludes(error.message, "reach Route53 through SimAws");
  });

  it("refuses a second key signing key of the same name", async () => {
    // Given a zone that already has a key signing key.
    const fixture = await simRoute53DnssecFixture();
    await withKeySigningKey(fixture);

    // When another is created with the same name on a different KMS key.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().createKeySigningKey(
        new CreateKeySigningKeyCommand({
          CallerReference: "ksk",
          HostedZoneId: fixture.hostedZoneId,
          KeyManagementServiceArn: await simKmsSigningKeyArn(fixture.simAws),
          Name: "zone_signing_key",
          Status: "ACTIVE",
        }),
      ),
    );

    // Then it is refused: a name identifies a key within its zone.
    assertInstanceOf(error, SimRoute53KeySigningKeyAlreadyExists);
  });

  it("refuses a second key signing key on the same KMS key", async () => {
    // Given a zone that already has a key signing key.
    const fixture = await simRoute53DnssecFixture();
    await withKeySigningKey(fixture);

    // When another is created on the same KMS key.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().createKeySigningKey(
        new CreateKeySigningKeyCommand({
          CallerReference: "ksk",
          HostedZoneId: fixture.hostedZoneId,
          KeyManagementServiceArn: fixture.kmsKeyArn,
          Name: "another_key",
          Status: "ACTIVE",
        }),
      ),
    );

    // Then it is refused, because the two would be indistinguishable in the
    // zone's DNSKEY set.
    assertInstanceOf(error, SimRoute53KeySigningKeyAlreadyExists);
  });

  it("refuses a key signing key status that is not a status", async () => {
    // Given a hosted zone.
    const fixture = await simRoute53DnssecFixture();

    // When a key signing key is created with no status, which Route53
    // requires rather than defaulting.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().createKeySigningKey({
        input: {
          HostedZoneId: fixture.hostedZoneId,
          KeyManagementServiceArn: fixture.kmsKeyArn,
          Name: "zone_signing_key",
        },
      }),
    );

    // Then it is refused.
    assertStringIncludes(error.message, "Status");
  });

  it("refuses signing a zone with no active key signing key", async () => {
    // Given a zone whose only key signing key is inactive.
    const fixture = await simRoute53DnssecFixture();
    await withKeySigningKey(fixture, "INACTIVE");

    // When signing is turned on.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().enableHostedZoneDnssec(
        new EnableHostedZoneDNSSECCommand({
          HostedZoneId: fixture.hostedZoneId,
        }),
      ),
    );

    // Then it is refused rather than reporting a zone no resolver could
    // validate.
    assertInstanceOf(error, SimRoute53NoActiveKeySigningKey);
  });

  it("refuses deleting a key signing key that is still signing", async () => {
    // Given a zone with an active key signing key.
    const fixture = await simRoute53DnssecFixture();
    await withKeySigningKey(fixture);

    // When the key is deleted without being deactivated first.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().deleteKeySigningKey(
        new DeleteKeySigningKeyCommand({
          HostedZoneId: fixture.hostedZoneId,
          Name: "zone_signing_key",
        }),
      ),
    );

    // Then it is refused, as real Route53 refuses it.
    assertInstanceOf(error, SimRoute53InvalidKeySigningKeyStatus);
  });

  it("refuses a key signing key the zone does not have", async () => {
    // Given a zone with no key signing keys.
    const fixture = await simRoute53DnssecFixture();

    // When one is deleted by name.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().deleteKeySigningKey(
        new DeleteKeySigningKeyCommand({
          HostedZoneId: fixture.hostedZoneId,
          Name: "zone_signing_key",
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimRoute53NoSuchKeySigningKey);
  });

  it("refuses disabling DNSSEC on an unsigned zone", async () => {
    // Given a zone that is not signed.
    const fixture = await simRoute53DnssecFixture();

    // When signing is turned off.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().disableHostedZoneDnssec(
        new DisableHostedZoneDNSSECCommand({
          HostedZoneId: fixture.hostedZoneId,
        }),
      ),
    );

    // Then it is refused rather than quietly doing nothing.
    assertInstanceOf(error, SimRoute53DnssecNotFound);
  });

  it("refuses deleting a signed hosted zone", async () => {
    // Given a zone that is being signed.
    const fixture = await simRoute53DnssecFixture();
    await withKeySigningKey(fixture);
    await fixture.simAws.route53().enableHostedZoneDnssec(
      new EnableHostedZoneDNSSECCommand({
        HostedZoneId: fixture.hostedZoneId,
      }),
    );

    // When the zone is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws
        .route53()
        .deleteHostedZone(
          new DeleteHostedZoneCommand({ Id: fixture.hostedZoneId }),
        ),
    );

    // Then it is refused, as real Route53 refuses it: the DS record at the
    // parent would be left pointing at a zone that had gone.
    assertInstanceOf(error, SimRoute53DnssecNotFound);
  });

  it("refuses DNSSEC on a hosted zone that does not exist", async () => {
    // Given a simulation with a hosted zone.
    const fixture = await simRoute53DnssecFixture();

    // When DNSSEC is read for another zone ID.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws
        .route53()
        .getDnssec(
          new GetDNSSECCommand({ HostedZoneId: "Z00000000000000000000A" }),
        ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimRoute53NoSuchHostedZone);
  });

  it("refuses a key signing key with no name", async () => {
    // Given a hosted zone.
    const fixture = await simRoute53DnssecFixture();

    // When a key signing key is created with no name.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().createKeySigningKey({
        input: {
          HostedZoneId: fixture.hostedZoneId,
          KeyManagementServiceArn: fixture.kmsKeyArn,
          Status: "ACTIVE",
        },
      }),
    );

    // Then it is refused, since the name is what identifies it in the zone.
    assertStringIncludes(error.message, "Name is required");
  });

  it("refuses a key signing key with no KMS ARN", async () => {
    // Given a hosted zone.
    const fixture = await simRoute53DnssecFixture();

    // When a key signing key is created with no KMS key behind it.
    const error = await assertThrowsErrorAsync(async () =>
      fixture.simAws.route53().createKeySigningKey({
        input: {
          HostedZoneId: fixture.hostedZoneId,
          Name: "zone_signing_key",
          Status: "ACTIVE",
        },
      }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimRoute53InvalidKmsArn);
  });
});

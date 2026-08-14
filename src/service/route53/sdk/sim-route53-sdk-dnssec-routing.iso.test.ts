import {
  ActivateKeySigningKeyCommand,
  CreateHostedZoneCommand,
  CreateKeySigningKeyCommand,
  DeactivateKeySigningKeyCommand,
  DeleteKeySigningKeyCommand,
  DisableHostedZoneDNSSECCommand,
  EnableHostedZoneDNSSECCommand,
  GetDNSSECCommand,
  Route53Client,
} from "@aws-sdk/client-route-53";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { simKmsSigningKeyArn } from "../../../../test/route53/dnssec-fixture.js";

describe("simulated Route53 DNSSEC SDK Command routing", () => {
  it("round-trips DNSSEC Commands through an intercepted client", async () => {
    // Given an intercepted Route53 client, a hosted zone and a signing key.
    using simSdk = new SimSdk();
    const client = new Route53Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const zone = await client.send(
      new CreateHostedZoneCommand({
        Name: "example.test",
        CallerReference: "dnssec-sdk-ref",
      }),
    );
    assertNonNullable(zone.HostedZone?.Id);
    const HostedZoneId = zone.HostedZone.Id;
    const kmsArn = await simKmsSigningKeyArn(simSdk.simAws);

    // When every DNSSEC Command is sent through the client.
    const created = await client.send(
      new CreateKeySigningKeyCommand({
        CallerReference: "ksk",
        HostedZoneId,
        KeyManagementServiceArn: kmsArn,
        Name: "zone_signing_key",
        Status: "INACTIVE",
      }),
    );
    await client.send(
      new ActivateKeySigningKeyCommand({
        HostedZoneId,
        Name: "zone_signing_key",
      }),
    );
    await client.send(new EnableHostedZoneDNSSECCommand({ HostedZoneId }));

    const signing = await client.send(new GetDNSSECCommand({ HostedZoneId }));

    await client.send(new DisableHostedZoneDNSSECCommand({ HostedZoneId }));
    await client.send(
      new DeactivateKeySigningKeyCommand({
        HostedZoneId,
        Name: "zone_signing_key",
      }),
    );
    await client.send(
      new DeleteKeySigningKeyCommand({
        HostedZoneId,
        Name: "zone_signing_key",
      }),
    );

    const unsigned = await client.send(new GetDNSSECCommand({ HostedZoneId }));

    // Then each one reached the simulation and answered as it would directly.
    assertIdentical(created.KeySigningKey?.Name, "zone_signing_key");
    assertIdentical(signing.Status?.ServeSignature, "SIGNING");
    assertArrayLength(signing.KeySigningKeys ?? [], 1);
    assertIdentical(unsigned.Status?.ServeSignature, "NOT_SIGNING");
    assertArrayLength(unsigned.KeySigningKeys ?? [], 0);
  });
});

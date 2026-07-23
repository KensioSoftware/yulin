import { describe, it } from "vitest";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  DeleteHostedZoneCommand,
  GetHostedZoneCommand,
  ListHostedZonesByNameCommand,
  Route53Client,
} from "@aws-sdk/client-route-53";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimSdk } from "../../../sdk/index.js";
import { assertIsSimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";

describe("simulated Route53 SDK Command routing", () => {
  it("round-trips Hosted Zone Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new Route53Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const zoneCreation = await client.send(
      new CreateHostedZoneCommand({
        Name: "example.com",
        CallerReference: "sdk-intercept-ref-1",
      }),
    );
    assertNonNullable(zoneCreation.HostedZone?.Id);
    const hostedZoneId = zoneCreation.HostedZone.Id;

    const zoneOut = await client.send(
      new GetHostedZoneCommand({ Id: hostedZoneId }),
    );
    assertIdentical(zoneOut.HostedZone?.Name, "example.com.");

    const listOutput = await client.send(
      new ListHostedZonesByNameCommand({ DNSName: "example.com" }),
    );
    assertIdentical(listOutput.HostedZones?.[0]?.Id, hostedZoneId);
  });

  it("routes ChangeResourceRecordSetsCommand through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new Route53Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const zoneCreation = await client.send(
      new CreateHostedZoneCommand({
        Name: "records.example.com",
        CallerReference: "sdk-intercept-ref-2",
      }),
    );
    assertNonNullable(zoneCreation.HostedZone?.Id);

    const changeOutput = await client.send(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: zoneCreation.HostedZone.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                Name: "www.records.example.com",
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: "192.0.2.10" }],
              },
            },
          ],
        },
      }),
    );

    assertIdentical(changeOutput.ChangeInfo?.Status, "PENDING");

    await simSdk.simAws.backgroundTasksComplete();
    assertIsSimRoute53HostedZoneId(zoneCreation.HostedZone.Id);
    const hostedZone = simSdk.simAws
      .route53()
      .hostedZones.get(zoneCreation.HostedZone.Id);
    assertIdentical(hostedZone?.status, "INSYNC");
  });

  it("rejects a Command simulated Route53 does not support", async () => {
    using simSdk = new SimSdk();
    const client = new Route53Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(new DeleteHostedZoneCommand({ Id: "Z123" }));
    });

    assertStringIncludes(error.message, "DeleteHostedZoneCommand");
    assertStringIncludes(error.message, "CreateHostedZoneCommand");
  });
});

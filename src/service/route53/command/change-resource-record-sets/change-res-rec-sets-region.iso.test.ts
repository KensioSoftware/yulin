import {
  assertFalse,
  assertIdentical,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  assertIsSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53 } from "../../sim-route53.js";

describe("Route53 ChangeResourceRecordSetsCommand region behavior", () => {
  async function createHostedZone(
    simRoute53: SimRoute53,
    name: string,
  ): Promise<SimRoute53HostedZoneId> {
    const createHostedZoneOutput = await simRoute53.createHostedZone({
      input: {
        Name: name,
        CallerReference: `${name}-test`,
      },
    });

    const hostedZoneId = createHostedZoneOutput.HostedZone?.Id;
    assertIsSimRoute53HostedZoneId(hostedZoneId);

    return hostedZoneId;
  }

  it("shares Route53 state across regions in the same account", async () => {
    // Given Route53 in two regions for the same account.
    const simAws = new SimAws();
    const usEastRoute53 = simAws
      .account("555555555555")
      .region("us-east-1")
      .route53();
    const euWestRoute53 = simAws
      .account("555555555555")
      .region("eu-west-1")
      .route53();

    const hostedZoneId = await createHostedZone(
      usEastRoute53,
      "shared-region.example.com",
    );

    await simAws.backgroundTasksComplete();

    // When a record is changed through another region.
    await euWestRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.shared-region.example.com",
                Type: "A",
                TTL: 60,
                ResourceRecords: [{ Value: "192.0.2.20" }],
              },
            },
          ],
        },
      },
    });

    await simAws.backgroundTasksComplete();

    // Then the change is visible from the original region.
    assertIdentical(usEastRoute53, euWestRoute53);
    assertObjectMatches(
      usEastRoute53.hostedZones
        .get(hostedZoneId)
        ?.records.get("www.shared-region.example.com", "A"),
      {
        values: ["192.0.2.20"],
        ttl: 60,
      },
    );
  });

  it("keeps Route53 state isolated between accounts even when regions match", async () => {
    // Given Route53 in the same region for two different accounts.
    const simAws = new SimAws();
    const firstAccountRoute53 = simAws
      .region("us-east-1")
      .account("111111111111")
      .route53();
    const secondAccountRoute53 = simAws
      .region("us-east-1")
      .account("222222222222")
      .route53();

    const hostedZoneId = await createHostedZone(
      firstAccountRoute53,
      "account-region.example.com",
    );

    await simAws.backgroundTasksComplete();

    // When a record is created in the first account's hosted zone.
    await firstAccountRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.account-region.example.com",
                Type: "A",
                ResourceRecords: [{ Value: "192.0.2.21" }],
              },
            },
          ],
        },
      },
    });

    await simAws.backgroundTasksComplete();

    // Then that hosted zone and record are not present in the second account.
    assertObjectMatches(
      firstAccountRoute53.hostedZones
        .get(hostedZoneId)
        ?.records.get("www.account-region.example.com", "A"),
      {
        values: ["192.0.2.21"],
      },
    );
    assertFalse(secondAccountRoute53.hostedZones.has(hostedZoneId));
  });
});

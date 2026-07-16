import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  CreateHostedZoneCommand,
  ListHostedZonesByNameCommand,
} from "@aws-sdk/client-route-53";

describe("Route53 ListHostedZonesByNameCommand", () => {
  it("lists Hosted Zones sorted by DNS name", async () => {
    // Given multiple Hosted Zones created out of lexical order.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "z.example.com",
        CallerReference: "z-zone",
      }),
    );

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "a.example.com",
        CallerReference: "a-zone",
      }),
    );

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "m.example.com",
        CallerReference: "m-zone",
      }),
    );

    // When Hosted Zones are listed by name.
    const listHostedZonesOutput = await simRoute53.listHostedZonesByName(
      new ListHostedZonesByNameCommand(),
    );

    // Then the Hosted Zones are returned sorted by normalized DNS name.
    assertArrayLength(listHostedZonesOutput.HostedZones, 3);
    assertIdentical(
      listHostedZonesOutput.HostedZones[0].Name,
      "a.example.com.",
    );
    assertIdentical(
      listHostedZonesOutput.HostedZones[1].Name,
      "m.example.com.",
    );
    assertIdentical(
      listHostedZonesOutput.HostedZones[2].Name,
      "z.example.com.",
    );
    assertFalse(listHostedZonesOutput.IsTruncated);
    assertIdentical(listHostedZonesOutput.MaxItems, 100);
    assertObjectMatches(listHostedZonesOutput.$metadata, {});
  });

  it("lists Hosted Zones at or after a DNSName marker", async () => {
    // Given multiple Hosted Zones before and after a DNSName marker.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "alpha.example.com",
        CallerReference: "alpha-zone",
      }),
    );

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "bravo.example.com",
        CallerReference: "bravo-zone",
      }),
    );

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "charlie.example.com",
        CallerReference: "charlie-zone",
      }),
    );

    // When Hosted Zones are listed from a DNSName marker.
    const listHostedZonesOutput = await simRoute53.listHostedZonesByName(
      new ListHostedZonesByNameCommand({
        DNSName: "bravo.example.com",
      }),
    );

    // Then Hosted Zones before the marker are skipped.
    assertArrayLength(listHostedZonesOutput.HostedZones, 2);
    assertIdentical(
      listHostedZonesOutput.HostedZones[0].Name,
      "bravo.example.com.",
    );
    assertIdentical(
      listHostedZonesOutput.HostedZones[1].Name,
      "charlie.example.com.",
    );
    assertIdentical(listHostedZonesOutput.DNSName, "bravo.example.com");
    assertFalse(listHostedZonesOutput.IsTruncated);
  });

  it("reflects Hosted Zones created as background tasks complete via the shared SimAws background scheduler", async () => {
    // Given a SimAws instance whose background scheduler is shared across services.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a Hosted Zone is created (which schedules a background synchronization task).
    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "background-sync.example.com",
        CallerReference: "background-sync-ref",
      }),
    );

    // Then the Hosted Zone is already visible in the listing before background tasks complete.
    const listBeforeComplete = await simRoute53.listHostedZonesByName(
      new ListHostedZonesByNameCommand(),
    );
    assertArrayLength(listBeforeComplete.HostedZones, 1);

    // When the shared background scheduler is drained via SimAws.
    await simAws.backgroundTasksComplete();

    // Then the listing still reflects the Hosted Zone, confirming the background
    // instance used by listHostedZonesByName is the same one owned by SimAws.
    const listAfterComplete = await simRoute53.listHostedZonesByName(
      new ListHostedZonesByNameCommand(),
    );
    assertArrayLength(listAfterComplete.HostedZones, 1);
    assertIdentical(
      listAfterComplete.HostedZones[0].Name,
      "background-sync.example.com.",
    );
  });
});

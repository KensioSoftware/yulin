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
});

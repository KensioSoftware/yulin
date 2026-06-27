import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

describe("Route53 ListHostedZonesByNameCommand", () => {
  it("paginates Hosted Zones using MaxItems and returns the next marker", async () => {
    // Given more Hosted Zones than the requested page size.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    await simRoute53.createHostedZone({
      input: {
        Name: "one.example.com",
        CallerReference: "one-zone",
      },
    });

    const secondZoneOutput = await simRoute53.createHostedZone({
      input: {
        Name: "two.example.com",
        CallerReference: "two-zone",
      },
    });

    await simRoute53.createHostedZone({
      input: {
        Name: "three.example.com",
        CallerReference: "three-zone",
      },
    });

    const secondHostedZoneId = secondZoneOutput.HostedZone?.Id;
    assertNonNullable(secondHostedZoneId, "Second Hosted Zone ID");

    // When Hosted Zones are listed with a one-item page size.
    const listHostedZonesOutput = await simRoute53.listHostedZonesByName({
      input: {
        MaxItems: "1",
      },
    });

    // Then only the first sorted Hosted Zone is returned with the next marker.
    assertArrayLength(listHostedZonesOutput.HostedZones, 1);
    assertIdentical(
      listHostedZonesOutput.HostedZones[0].Name,
      "one.example.com.",
    );
    assertIdentical(listHostedZonesOutput.IsTruncated, true);
    assertIdentical(listHostedZonesOutput.NextDNSName, "three.example.com.");
    assertIdentical(listHostedZonesOutput.MaxItems, "1");
  });

  it("continues at a DNSName and HostedZoneId marker for duplicate names", async () => {
    // Given multiple Hosted Zones with the same DNS name.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    const firstZoneOutput = await simRoute53.createHostedZone({
      input: {
        Name: "duplicate.example.com",
        CallerReference: "first-duplicate-zone",
      },
    });

    const secondZoneOutput = await simRoute53.createHostedZone({
      input: {
        Name: "duplicate.example.com",
        CallerReference: "second-duplicate-zone",
      },
    });

    const firstHostedZoneId = firstZoneOutput.HostedZone?.Id;
    const secondHostedZoneId = secondZoneOutput.HostedZone?.Id;
    assertNonNullable(firstHostedZoneId, "First Hosted Zone ID");
    assertNonNullable(secondHostedZoneId, "Second Hosted Zone ID");

    const markerHostedZoneId =
      firstHostedZoneId.localeCompare(secondHostedZoneId) < 0
        ? firstHostedZoneId
        : secondHostedZoneId;
    const nextHostedZoneId =
      markerHostedZoneId === firstHostedZoneId
        ? secondHostedZoneId
        : firstHostedZoneId;

    // When Hosted Zones are listed from a duplicate-name HostedZoneId marker.
    const listHostedZonesOutput = await simRoute53.listHostedZonesByName({
      input: {
        DNSName: "duplicate.example.com",
        HostedZoneId: markerHostedZoneId,
      },
    });

    // Then duplicate-name Hosted Zones at and after that HostedZoneId are returned.
    assertArrayLength(listHostedZonesOutput.HostedZones, 2);
    assertIdentical(
      listHostedZonesOutput.HostedZones[0].Id,
      markerHostedZoneId,
    );
    assertIdentical(listHostedZonesOutput.HostedZones[1].Id, nextHostedZoneId);
    assertIdentical(
      listHostedZonesOutput.HostedZones[0].Name,
      "duplicate.example.com.",
    );
    assertIdentical(
      listHostedZonesOutput.HostedZones[1].Name,
      "duplicate.example.com.",
    );
    assertIdentical(listHostedZonesOutput.HostedZoneId, markerHostedZoneId);
    assertIdentical(listHostedZonesOutput.IsTruncated, false);
  });
});

import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertObjectMatches,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

describe("Route53 ListHostedZonesByNameCommand", () => {
  it("lists Hosted Zones sorted by DNS name", async () => {
    // Given multiple Hosted Zones created out of lexical order.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    await simRoute53.createHostedZone({
      input: {
        Name: "z.example.com",
        CallerReference: "z-zone",
      },
    });

    await simRoute53.createHostedZone({
      input: {
        Name: "a.example.com",
        CallerReference: "a-zone",
      },
    });

    await simRoute53.createHostedZone({
      input: {
        Name: "m.example.com",
        CallerReference: "m-zone",
      },
    });

    // When Hosted Zones are listed by name.
    const listHostedZonesOutput = await simRoute53.listHostedZonesByName({
      input: {},
    });

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
    assertIdentical(listHostedZonesOutput.MaxItems, "100");
    assertObjectMatches(listHostedZonesOutput.$metadata, {});
  });

  it("lists Hosted Zones at or after a DNSName marker", async () => {
    // Given multiple Hosted Zones before and after a DNSName marker.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    await simRoute53.createHostedZone({
      input: {
        Name: "alpha.example.com",
        CallerReference: "alpha-zone",
      },
    });

    await simRoute53.createHostedZone({
      input: {
        Name: "bravo.example.com",
        CallerReference: "bravo-zone",
      },
    });

    await simRoute53.createHostedZone({
      input: {
        Name: "charlie.example.com",
        CallerReference: "charlie-zone",
      },
    });

    // When Hosted Zones are listed from a DNSName marker.
    const listHostedZonesOutput = await simRoute53.listHostedZonesByName({
      input: {
        DNSName: "bravo.example.com",
      },
    });

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

  it("throws when MaxItems is invalid", async () => {
    // Given a simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When Hosted Zones are listed with an invalid MaxItems value.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.listHostedZonesByName({
        input: {
          MaxItems: "0",
        },
      }),
    );

    // Then a clear validation error is thrown.
    assertIdentical(
      error.message,
      "ListHostedZonesByNameCommand.input.MaxItems is invalid",
    );
  });
});

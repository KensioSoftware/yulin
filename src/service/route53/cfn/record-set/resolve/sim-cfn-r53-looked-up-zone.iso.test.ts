import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimRoute53 } from "../../../sim-route53.js";
import type { SimRoute53HostedZoneId } from "../../../command/create-hosted-zone/sim-route53-zone-id.js";
import { SimCfnRoute53LookedUpZone } from "./sim-cfn-r53-looked-up-zone.js";

describe("SimCfnRoute53LookedUpZone", () => {
  const hostedZoneId = "Z2FDTNDATAQYW2" as SimRoute53HostedZoneId;

  function lookedUpZone(route53: SimRoute53): SimCfnRoute53LookedUpZone {
    return new SimCfnRoute53LookedUpZone({ route53 });
  }

  it("registers a Hosted Zone named after the first record to reference it", () => {
    // Given a sim Route53 with no Hosted Zones.
    const route53 = new SimRoute53();

    // When a record names a Hosted Zone by ID alone.
    lookedUpZone(route53).ensure(hostedZoneId, "www.example.com");

    // Then the zone exists under that ID, named from the record.
    const hostedZone = route53.hostedZones.get(hostedZoneId);

    assertNonNullable(hostedZone);
    assertIdentical(hostedZone.name, "www.example.com.");
  });

  it("widens the inferred name for a record above it", () => {
    // Given a Hosted Zone inferred from a subdomain record.
    const route53 = new SimRoute53();
    const zone = lookedUpZone(route53);

    zone.ensure(hostedZoneId, "www.example.com");

    // When a second record at the apex references the same zone.
    zone.ensure(hostedZoneId, "example.com");

    // Then the inferred name widens to contain both records.
    const hostedZone = route53.hostedZones.get(hostedZoneId);

    assertNonNullable(hostedZone);
    assertIdentical(hostedZone.name, "example.com.");
  });

  it("leaves the inferred name alone for a record already inside it", () => {
    // Given a Hosted Zone inferred from an apex record.
    const route53 = new SimRoute53();
    const zone = lookedUpZone(route53);

    zone.ensure(hostedZoneId, "example.com");

    // When a subdomain record references the same zone.
    zone.ensure(hostedZoneId, "www.example.com");

    // Then the zone keeps the name that already contains the record.
    const hostedZone = route53.hostedZones.get(hostedZoneId);

    assertNonNullable(hostedZone);
    assertIdentical(hostedZone.name, "example.com.");
  });

  it("leaves a Hosted Zone that was named rather than inferred", async () => {
    // Given a Hosted Zone the caller created, so its name is known.
    const route53 = new SimRoute53();
    const created = await route53.createHostedZone({
      input: {
        Name: "www.example.com",
        CallerReference: "looked-up-zone-test",
      },
    });
    assertNonNullable(created.HostedZone?.Id);

    const createdId = created.HostedZone.Id.replace(
      "/hostedzone/",
      "",
    ) as SimRoute53HostedZoneId;

    // When a record above it names it by ID.
    lookedUpZone(route53).ensure(createdId, "example.com");

    // Then the known name stands: the record is outside the zone, and widening
    // here would hide that rather than report it.
    const hostedZone = route53.hostedZones.get(createdId);

    assertNonNullable(hostedZone);
    assertIdentical(hostedZone.name, "www.example.com.");
  });
});

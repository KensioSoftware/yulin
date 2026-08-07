import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { widenSimRoute53ZoneName } from "./sim-route53-zone-name-widening.js";

describe("widenSimRoute53ZoneName", () => {
  it("keeps a zone name that already contains the record", () => {
    // Given a zone name and a record name below it.
    // When the zone name is widened by the record name.
    const widened = widenSimRoute53ZoneName("example.com", "www.example.com");

    // Then the zone name is unchanged, because it already contains the record.
    assertIdentical(widened, "example.com");
  });

  it("keeps a zone name that is the record name", () => {
    // Given a zone name equal to the record name.
    // When the zone name is widened by it.
    const widened = widenSimRoute53ZoneName("example.com", "example.com");

    // Then the apex record leaves the zone name alone.
    assertIdentical(widened, "example.com");
  });

  it("drops labels until the zone name contains the record", () => {
    // Given a zone name inferred from a subdomain record.
    // When a record at the apex widens it.
    const widened = widenSimRoute53ZoneName("www.example.com", "example.com");

    // Then the zone name is the shortest name containing both.
    assertIdentical(widened, "example.com");
  });

  it("widens to the shared suffix of two sibling record names", () => {
    // Given a zone name inferred from one subdomain record.
    // When a sibling subdomain record widens it.
    const widened = widenSimRoute53ZoneName(
      "www.example.com",
      "mail.example.com",
    );

    // Then neither name contains the other, so the shared parent is the zone.
    assertIdentical(widened, "example.com");
  });

  it("ignores a trailing dot on either name", () => {
    // Given a fully qualified zone name and record name.
    // When the zone name is widened.
    const widened = widenSimRoute53ZoneName("www.example.com.", "example.com.");

    // Then the trailing dots make no difference to the labels compared.
    assertIdentical(widened, "example.com");
  });

  it("refuses names that share no domain suffix", () => {
    // Given a zone name and a record name in an unrelated domain.
    // When the zone name is widened by it, then it refuses rather than
    // returning a zone name containing neither.
    const error = assertThrowsError(() =>
      widenSimRoute53ZoneName("www.example.com", "www.example.org"),
    );

    // And both names are named for diagnosis.
    assertStringIncludes(error.message, "www.example.com");
    assertStringIncludes(error.message, "www.example.org");
  });
});

import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCloudFrontCachePolicy } from "../cache-policy/sim-cf-cache-policy.js";
import { simCfCacheTtlSec } from "./sim-cf-cache-ttl.js";

const now = new Date("2026-08-29T12:00:00.000Z");

/**
 * The seconds a policy holds an Origin answer carrying these headers for.
 */
function heldForSec(
  policy: SimCloudFrontCachePolicy,
  headers: Record<string, string> = {},
): number {
  return simCfCacheTtlSec({
    response: new Response("<h1>Home</h1>", { headers }),
    policy,
    now,
  });
}

describe("How long a sim CloudFront Distribution holds an Origin's answer", () => {
  it("holds an answer carrying no cache header for the policy's default TTL", () => {
    // Given a policy with an hour of default TTL and no floor under it.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 0,
      defaultTtlSec: 3600,
      maxTtlSec: 86_400,
    });

    // Then an Origin that asked for nothing gets the default.
    assertIdentical(heldForSec(policy), 3600);
  });

  it("raises an answer carrying no cache header to a MinTTL above the default", () => {
    // Given a policy whose floor sits above its default TTL.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 7200,
      defaultTtlSec: 3600,
      maxTtlSec: 86_400,
    });

    // Then the floor is what an Origin asking for nothing gets. CloudFront
    // takes the greater of the two.
    assertIdentical(heldForSec(policy), 7200);
  });

  it("takes the max-age an Origin asked for, between the policy's TTLs", () => {
    // Given a policy holding anything from a minute to a day.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 60,
      defaultTtlSec: 3600,
      maxTtlSec: 86_400,
    });

    // Then an hour asked for inside that range is an hour, a minute asked for
    // under the floor is the floor, and a week asked for over the ceiling is
    // the ceiling.
    assertIdentical(
      heldForSec(policy, { "cache-control": "max-age=3600" }),
      3600,
    );
    assertIdentical(heldForSec(policy, { "cache-control": "max-age=5" }), 60);
    assertIdentical(
      heldForSec(policy, { "cache-control": "max-age=604800" }),
      86_400,
    );
  });

  it("prefers s-maxage to max-age", () => {
    // Given a policy that grants whatever an Origin asks for.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 0,
      defaultTtlSec: 3600,
      maxTtlSec: 86_400,
    });

    // Then the shared cache directive decides, and the browser's is left to
    // the browser.
    assertIdentical(
      heldForSec(policy, { "cache-control": "max-age=60, s-maxage=600" }),
      600,
    );
  });

  it("prefers max-age to an Expires header", () => {
    // Given a policy that grants whatever an Origin asks for, and an Origin
    // naming both a max-age and an hour-away expiry.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 0,
      defaultTtlSec: 86_400,
      maxTtlSec: 86_400,
    });

    // Then the directive decides and the header is left alone.
    assertIdentical(
      heldForSec(policy, {
        "cache-control": "max-age=60",
        expires: "Sat, 29 Aug 2026 13:00:00 GMT",
      }),
      60,
    );
  });

  it("holds an answer until the instant its Expires header names", () => {
    // Given a policy that grants whatever an Origin asks for.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 0,
      defaultTtlSec: 86_400,
      maxTtlSec: 86_400,
    });

    // Then an expiry an hour out is an hour, and one already gone by is no
    // time at all.
    assertIdentical(
      heldForSec(policy, { expires: "Sat, 29 Aug 2026 13:00:00 GMT" }),
      3600,
    );
    assertIdentical(
      heldForSec(policy, { expires: "Sat, 29 Aug 2026 11:00:00 GMT" }),
      0,
    );
  });

  it("reads an Expires header that is not a date as already expired", () => {
    // Given a policy that would otherwise hold the answer for a day.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 0,
      defaultTtlSec: 86_400,
      maxTtlSec: 86_400,
    });

    // Then the answer is held for no time. An Origin naming no expiry at all
    // would have got the default TTL.
    assertIdentical(heldForSec(policy, { expires: "0" }), 0);
  });

  it("caps an Expires header at the policy's MaxTTL", () => {
    // Given a policy holding nothing for longer than a minute.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 0,
      defaultTtlSec: 60,
      maxTtlSec: 60,
    });

    // Then an expiry an hour out is held for the minute the policy allows.
    assertIdentical(
      heldForSec(policy, { expires: "Sat, 29 Aug 2026 13:00:00 GMT" }),
      60,
    );
  });

  it("stores nothing an Origin refused, where the policy has no floor", () => {
    // Given a policy that would otherwise hold an answer for an hour.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 0,
      defaultTtlSec: 3600,
      maxTtlSec: 86_400,
    });

    // Then each of the three refusals is respected, whatever else the Origin
    // asked for alongside it.
    assertIdentical(heldForSec(policy, { "cache-control": "no-store" }), 0);
    assertIdentical(heldForSec(policy, { "cache-control": "no-cache" }), 0);
    assertIdentical(
      heldForSec(policy, { "cache-control": "private, max-age=600" }),
      0,
    );
  });

  it("holds an answer an Origin refused for a policy's MinTTL", () => {
    // Given a policy holding nothing for less than five minutes.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 300,
      defaultTtlSec: 3600,
      maxTtlSec: 86_400,
    });

    // Then the floor overrides the Origin. AWS carries a warning about this.
    assertIdentical(heldForSec(policy, { "cache-control": "no-store" }), 300);
  });

  it("reads a directive that names no whole number of seconds as absent", () => {
    // Given a policy with an hour of default TTL.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 0,
      defaultTtlSec: 3600,
      maxTtlSec: 86_400,
    });

    // Then a max-age naming something other than seconds falls through to the
    // default, and one naming nothing at all does the same.
    assertIdentical(
      heldForSec(policy, { "cache-control": "max-age=soon" }),
      3600,
    );
    assertIdentical(heldForSec(policy, { "cache-control": "max-age=" }), 3600);
    assertIdentical(
      heldForSec(policy, { "cache-control": "max-age=-60" }),
      3600,
    );
  });

  it("reads directives whatever their case, spacing and quoting", () => {
    // Given a policy that grants whatever an Origin asks for.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 0,
      defaultTtlSec: 86_400,
      maxTtlSec: 86_400,
    });

    // Then a header CloudFront would read is read the same way here.
    assertIdentical(
      heldForSec(policy, { "cache-control": ' Public , S-MaxAge = "600" ,' }),
      600,
    );
  });
});

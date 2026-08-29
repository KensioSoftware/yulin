import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontCacheKey } from "./sim-cf-cache-key.js";
import { SimCloudFrontCachePolicy } from "./sim-cf-cache-policy.js";

describe("SimCloudFrontCachePolicy", () => {
  it("falls back on CloudFront's own TTLs and an empty cache key", () => {
    // Given a policy carrying nothing but a name.
    const policy = new SimCloudFrontCachePolicy({ name: "BeaconPolicy" });

    // Then the TTLs are the ones CloudFront applies to a policy that named
    // none: nothing held for less than no time, a day by default, a year at
    // most.
    assertIdentical(policy.minTtlSec, 0);
    assertIdentical(policy.defaultTtlSec, 86_400);
    assertIdentical(policy.maxTtlSec, 31_536_000);

    // And nothing of the request joins the cache key.
    assertIdentical(policy.cacheKey.cookieBehavior, "none");
    assertIdentical(policy.cacheKey.headerBehavior, "none");
    assertIdentical(policy.cacheKey.queryStringBehavior, "none");
    assertArrayEquals(policy.cacheKey.cookies, []);
    assertArrayEquals(policy.cacheKey.headers, []);
    assertArrayEquals(policy.cacheKey.queryStrings, []);
    assertFalse(policy.cacheKey.enableAcceptEncodingGzip);
    assertFalse(policy.cacheKey.enableAcceptEncodingBrotli);
  });

  it("raises the default TTL to a MinTTL that sits above a day", () => {
    // Given a policy holding objects for at least a week, naming no other TTL.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      minTtlSec: 604_800,
    });

    // Then the default TTL is the floor rather than the day that would sit
    // below it, and the maximum is still a year.
    assertIdentical(policy.defaultTtlSec, 604_800);
    assertIdentical(policy.maxTtlSec, 31_536_000);
  });

  it("raises the maximum TTL to a default TTL that sits above a year", () => {
    // Given a policy whose default TTL is longer than a year.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      defaultTtlSec: 63_072_000,
    });

    // Then the maximum is the default rather than the year that would cap the
    // policy below its own default.
    assertIdentical(policy.maxTtlSec, 63_072_000);
  });

  it("keeps the cache key a policy was given", () => {
    // Given a policy keying on one cookie and everything but one query string.
    const policy = new SimCloudFrontCachePolicy({
      name: "BeaconPolicy",
      cacheKey: new SimCloudFrontCacheKey({
        cookieBehavior: "whitelist",
        cookies: ["session"],
        queryStringBehavior: "allExcept",
        queryStrings: ["utm_source"],
        enableAcceptEncodingBrotli: true,
      }),
    });

    // Then the cache key is what it was given.
    assertIdentical(policy.cacheKey.cookieBehavior, "whitelist");
    assertArrayEquals(policy.cacheKey.cookies, ["session"]);
    assertIdentical(policy.cacheKey.queryStringBehavior, "allExcept");
    assertArrayEquals(policy.cacheKey.queryStrings, ["utm_source"]);
  });
});

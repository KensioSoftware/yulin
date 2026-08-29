import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontCachePolicyRegistry } from "./sim-cf-cache-policy-registry.js";
import type { SimCloudFrontCachePolicy } from "./sim-cf-cache-policy.js";
import { simCfManagedCachePolicyIds } from "./sim-cf-managed-cache-policies.js";

describe("Managed CloudFront cache policies", () => {
  /**
   * One managed policy, from a registry no template has reached.
   */
  function policy(policyId: string): SimCloudFrontCachePolicy {
    const managed = new SimCloudFrontCachePolicyRegistry().byId(policyId);

    assertNonNullable(managed);

    return managed;
  }

  it("carries the TTLs AWS publishes for each of the seven", () => {
    // Given the seven managed policies.
    // When each one's TTLs are read.
    const ttls = Object.values(simCfManagedCachePolicyIds).map((policyId) => {
      const managed = policy(policyId);

      return `${managed.name} ${managed.minTtlSec}/${managed.defaultTtlSec}/${managed.maxTtlSec}`;
    });

    // Then each holds objects for as long as one in an account would.
    assertArrayEquals(ttls, [
      "Amplify 2/2/600",
      "CachingOptimized 1/86400/31536000",
      "CachingOptimizedForUncompressedObjects 1/86400/31536000",
      "CachingDisabled 0/0/0",
      "Elemental-MediaPackage 0/86400/31536000",
      "UseOriginCacheControlHeaders 0/0/31536000",
      "UseOriginCacheControlHeaders-QueryStrings 0/0/31536000",
    ]);
  });

  it("keys CachingOptimized on nothing but the compression", () => {
    // Given the policy CDK reaches for by default.
    const { cacheKey } = policy(simCfManagedCachePolicyIds.cachingOptimized);

    // Then one object is cached once, whatever the request carried, apart from
    // the compressed copies the Accept-Encoding flags separate.
    assertIdentical(cacheKey.cookieBehavior, "none");
    assertIdentical(cacheKey.headerBehavior, "none");
    assertIdentical(cacheKey.queryStringBehavior, "none");
    assertTrue(cacheKey.enableAcceptEncodingGzip);
    assertTrue(cacheKey.enableAcceptEncodingBrotli);
  });

  it("leaves the compression out of CachingOptimizedForUncompressedObjects", () => {
    // Given the policy that differs from CachingOptimized in compression
    // alone.
    const { cacheKey } = policy(
      simCfManagedCachePolicyIds.cachingOptimizedForUncompressedObjects,
    );

    // Then neither Accept-Encoding flag is set, so the key is the same for a
    // viewer that would take a compressed copy and one that would not.
    assertFalse(cacheKey.enableAcceptEncodingGzip);
    assertFalse(cacheKey.enableAcceptEncodingBrotli);
  });

  it("keys Amplify on the three headers, every cookie and every query string", () => {
    // Given the policy an Amplify web app Origin is served through.
    const { cacheKey } = policy(simCfManagedCachePolicyIds.amplify);

    // Then the cache key is the one AWS publishes for it.
    assertIdentical(cacheKey.headerBehavior, "whitelist");
    assertArrayEquals(cacheKey.headers, [
      "Authorization",
      "CloudFront-Viewer-Country",
      "Host",
    ]);
    assertIdentical(cacheKey.cookieBehavior, "all");
    assertIdentical(cacheKey.queryStringBehavior, "all");
  });

  it("keys Elemental-MediaPackage on the manifest query strings", () => {
    // Given the policy a MediaPackage endpoint Origin is served through.
    const { cacheKey } = policy(
      simCfManagedCachePolicyIds.elementalMediaPackage,
    );

    // Then the four query strings that select a manifest are in the key, along
    // with the Origin header, and Gzip alone is enabled.
    assertIdentical(cacheKey.queryStringBehavior, "whitelist");
    assertArrayEquals(cacheKey.queryStrings, [
      "aws.manifestfilter",
      "start",
      "end",
      "m",
    ]);
    assertIdentical(cacheKey.headerBehavior, "whitelist");
    assertArrayEquals(cacheKey.headers, ["Origin"]);
    assertIdentical(cacheKey.cookieBehavior, "none");
    assertTrue(cacheKey.enableAcceptEncodingGzip);
    assertFalse(cacheKey.enableAcceptEncodingBrotli);
  });

  it("separates the two UseOriginCacheControlHeaders policies by query string", () => {
    // Given the pair that differ from each other in query strings alone.
    const withoutQueryStrings = policy(
      simCfManagedCachePolicyIds.useOriginCacheControlHeaders,
    ).cacheKey;
    const withQueryStrings = policy(
      simCfManagedCachePolicyIds.useOriginCacheControlHeadersQueryStrings,
    ).cacheKey;

    // Then both key on the same five headers and every cookie.
    const headers = [
      "Host",
      "Origin",
      "X-HTTP-Method-Override",
      "X-HTTP-Method",
      "X-Method-Override",
    ];

    assertArrayEquals(withoutQueryStrings.headers, headers);
    assertArrayEquals(withQueryStrings.headers, headers);
    assertIdentical(withoutQueryStrings.cookieBehavior, "all");
    assertIdentical(withQueryStrings.cookieBehavior, "all");

    // And only the second one caches a request's query string apart.
    assertIdentical(withoutQueryStrings.queryStringBehavior, "none");
    assertIdentical(withQueryStrings.queryStringBehavior, "all");
  });

  it("disables caching in CachingDisabled without keying on anything", () => {
    // Given the policy that caches nothing.
    const disabled = policy(simCfManagedCachePolicyIds.cachingDisabled);

    // Then every TTL is zero and nothing of the request is in the key.
    assertIdentical(disabled.maxTtlSec, 0);
    assertIdentical(disabled.cacheKey.cookieBehavior, "none");
    assertIdentical(disabled.cacheKey.headerBehavior, "none");
    assertIdentical(disabled.cacheKey.queryStringBehavior, "none");
    assertFalse(disabled.cacheKey.enableAcceptEncodingGzip);
  });
});

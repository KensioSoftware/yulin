import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFrontCachePolicy } from "../../cache-policy/sim-cf-cache-policy.js";
import { SimCfnCfCachePolicyConfig } from "./sim-cfn-cf-cache-policy-config.js";

describe("AWS::CloudFront::CachePolicy cache key", () => {
  /**
   * The policy a `CachePolicyConfig` describes, under a Name of its own so
   * every case here is about the rest of the config.
   */
  function build(
    cachePolicyConfig: SimCfnTemplateValueRecord,
  ): SimCloudFrontCachePolicy {
    return new SimCfnCfCachePolicyConfig({
      resource: new SimCfnResource({ logicalId: "BeaconPolicy" }),
      properties: {
        CachePolicyConfig: { Name: "BeaconPolicy", ...cachePolicyConfig },
      },
    }).build();
  }

  /**
   * The message refusing a `CachePolicyConfig` that could not be read.
   */
  function refusal(cachePolicyConfig: SimCfnTemplateValueRecord): string {
    return assertThrowsError(() => build(cachePolicyConfig)).message;
  }

  it("records the three TTLs a template wrote", () => {
    // Given a policy holding an object for a minute at least and an hour at
    // most.
    const policy = build({ MinTTL: 60, DefaultTTL: 300, MaxTTL: 3600 });

    // Then all three are what the template wrote.
    assertIdentical(policy.minTtlSec, 60);
    assertIdentical(policy.defaultTtlSec, 300);
    assertIdentical(policy.maxTtlSec, 3600);
  });

  it("defaults a TTL the template left out", () => {
    // Given a policy naming its floor alone, which is the one CloudFormation
    // asks for.
    const policy = build({ MinTTL: 30 });

    // Then the other two are CloudFront's own defaults.
    assertIdentical(policy.minTtlSec, 30);
    assertIdentical(policy.defaultTtlSec, 86_400);
    assertIdentical(policy.maxTtlSec, 31_536_000);
  });

  it("records a cache key naming cookies, headers and query strings", () => {
    // Given a policy keying on one of each.
    const policy = build({
      ParametersInCacheKeyAndForwardedToOrigin: {
        EnableAcceptEncodingGzip: true,
        EnableAcceptEncodingBrotli: true,
        CookiesConfig: { CookieBehavior: "whitelist", Cookies: ["session"] },
        HeadersConfig: { HeaderBehavior: "whitelist", Headers: ["Accept"] },
        QueryStringsConfig: {
          QueryStringBehavior: "allExcept",
          QueryStrings: ["utm_source"],
        },
      },
    });

    // Then each section carries its behaviour and the names it applies to.
    assertIdentical(policy.cacheKey.cookieBehavior, "whitelist");
    assertArrayEquals(policy.cacheKey.cookies, ["session"]);
    assertIdentical(policy.cacheKey.headerBehavior, "whitelist");
    assertArrayEquals(policy.cacheKey.headers, ["Accept"]);
    assertIdentical(policy.cacheKey.queryStringBehavior, "allExcept");
    assertArrayEquals(policy.cacheKey.queryStrings, ["utm_source"]);

    // And both compression flags are set.
    assertTrue(policy.cacheKey.enableAcceptEncodingGzip);
    assertTrue(policy.cacheKey.enableAcceptEncodingBrotli);
  });

  it("keys on nothing where the template named no parameters at all", () => {
    // Given a policy with no ParametersInCacheKeyAndForwardedToOrigin.
    const policy = build({ MinTTL: 0 });

    // Then nothing of a request joins the key, which is CloudFront's `none`.
    assertIdentical(policy.cacheKey.cookieBehavior, "none");
    assertIdentical(policy.cacheKey.headerBehavior, "none");
    assertIdentical(policy.cacheKey.queryStringBehavior, "none");
    assertFalse(policy.cacheKey.enableAcceptEncodingGzip);
    assertFalse(policy.cacheKey.enableAcceptEncodingBrotli);
  });

  it("keys on every cookie where the section says all", () => {
    // Given a policy whose cookies section names `all` and lists nothing.
    const policy = build({
      ParametersInCacheKeyAndForwardedToOrigin: {
        CookiesConfig: { CookieBehavior: "all" },
      },
    });

    // Then the behaviour stands on its own, with an empty list beside it.
    assertIdentical(policy.cacheKey.cookieBehavior, "all");
    assertArrayEquals(policy.cacheKey.cookies, []);
  });

  it("refuses a cookie behaviour outside CloudFront's set", () => {
    // Given a policy naming a behaviour CloudFront does not offer.
    // When it is read, then the refusal names the Resource and the behaviour.
    const message = refusal({
      ParametersInCacheKeyAndForwardedToOrigin: {
        CookiesConfig: { CookieBehavior: "allViewer" },
      },
    });

    assertStringIncludes(message, "BeaconPolicy");
    assertStringIncludes(
      message,
      "CookiesConfig CookieBehavior must be one of",
    );
    assertStringIncludes(message, "allExcept");
  });

  it("refuses a header behaviour a cache key cannot take", () => {
    // Given a policy naming `allViewer`, which an origin request policy takes
    // and a cache key does not.
    // When it is read, then it is refused rather than kept as something else.
    const message = refusal({
      ParametersInCacheKeyAndForwardedToOrigin: {
        HeadersConfig: { HeaderBehavior: "allViewer" },
      },
    });

    assertStringIncludes(message, "BeaconPolicy");
    assertStringIncludes(
      message,
      "HeadersConfig HeaderBehavior must be one of none, whitelist",
    );
  });

  it("refuses a query string behaviour outside CloudFront's set", () => {
    // Given a policy naming a behaviour CloudFront does not offer.
    // When it is read, then the refusal names the section.
    assertStringIncludes(
      refusal({
        ParametersInCacheKeyAndForwardedToOrigin: {
          QueryStringsConfig: { QueryStringBehavior: "some" },
        },
      }),
      "QueryStringsConfig QueryStringBehavior must be one of",
    );
  });

  it("refuses parameters that are not an object", () => {
    // Given a policy whose parameters are a string.
    // When it is read, then the refusal says what could not be read.
    assertStringIncludes(
      refusal({ ParametersInCacheKeyAndForwardedToOrigin: "none" }),
      "ParametersInCacheKeyAndForwardedToOrigin must be an object",
    );
  });

  it("refuses a section that is not an object", () => {
    // Given a policy whose cookies section is a string.
    // When it is read, then the refusal names the section.
    assertStringIncludes(
      refusal({
        ParametersInCacheKeyAndForwardedToOrigin: { CookiesConfig: "none" },
      }),
      "CookiesConfig must be an object",
    );
  });

  it("refuses a name list holding something other than names", () => {
    // Given a policy whose header list carries a number.
    // When it is read, then the refusal names the list.
    assertStringIncludes(
      refusal({
        ParametersInCacheKeyAndForwardedToOrigin: {
          HeadersConfig: {
            HeaderBehavior: "whitelist",
            Headers: ["Accept", 1],
          },
        },
      }),
      "HeadersConfig Headers must be a list of strings",
    );
  });

  it("refuses a compression flag that is not a boolean", () => {
    // Given a policy whose Gzip flag is the string CloudFormation would have
    // parsed into one.
    // When it is read, then the refusal names the flag.
    assertStringIncludes(
      refusal({
        ParametersInCacheKeyAndForwardedToOrigin: {
          EnableAcceptEncodingGzip: "true",
        },
      }),
      "EnableAcceptEncodingGzip must be a boolean",
    );
  });

  it("refuses a TTL that is not a whole number of seconds", () => {
    // Given a policy whose MaxTTL is a fraction of a second.
    // When it is read, then the refusal names the TTL.
    assertStringIncludes(
      refusal({ MaxTTL: 0.5 }),
      "CachePolicyConfig MaxTTL must be a whole number of seconds",
    );
  });

  it("refuses a TTL below zero", () => {
    // Given a policy holding an object for less than no time.
    // When it is read, then it is refused rather than kept.
    assertStringIncludes(
      refusal({ MinTTL: -1 }),
      "CachePolicyConfig MinTTL must be a whole number of seconds",
    );
  });
});

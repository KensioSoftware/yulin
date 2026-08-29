import { SimCloudFrontCacheKey } from "./sim-cf-cache-key.js";
import {
  SimCloudFrontCachePolicy,
  type SimCloudFrontCachePolicyId,
  type SimCloudFrontCachePolicyMap,
} from "./sim-cf-cache-policy.js";

/**
 * The IDs AWS publishes for its managed cache policies.
 *
 * A template names one of these directly. CDK's `CachePolicy` statics carry
 * the same seven, and synthesize the ID into a Behavior's `CachePolicyId` with
 * no Resource behind it.
 */
export const simCfManagedCachePolicyIds = {
  amplify: "2e54312d-136d-493c-8eb9-b001f22f67d2",
  cachingOptimized: "658327ea-f89d-4fab-a63d-7e88639e58f6",
  cachingOptimizedForUncompressedObjects:
    "b2884449-e4de-46a7-ac36-70bc7f1ddd6d",
  cachingDisabled: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
  elementalMediaPackage: "08627262-05a9-4f76-9ded-b50ca2e3a84f",
  useOriginCacheControlHeaders: "83da9c7e-98b4-4e11-a168-04f0df8e2c65",
  useOriginCacheControlHeadersQueryStrings:
    "4cc15a8a-d715-48a4-82b8-cc0b614638fe",
} as const;

const daySeconds = 86_400;
const yearSeconds = 31_536_000;

/**
 * The headers the two UseOriginCacheControlHeaders policies key on. They
 * differ from each other in their query strings alone.
 */
const originCacheControlHeaders = [
  "Host",
  "Origin",
  "X-HTTP-Method-Override",
  "X-HTTP-Method",
  "X-Method-Override",
];

/**
 * The seven managed cache policies, built fresh for one simulated CloudFront.
 *
 * CloudFront owns these and every account has them, so a Behavior can name one
 * without a template creating anything. Each carries the ID, the name, the
 * TTLs and the cache key AWS publishes for it, so a Behavior on
 * `CachingOptimized` here holds what one in an account holds.
 *
 * The normalized `Accept-Encoding` header AWS lists in some of these keys is
 * not a header name in the whitelist. It is what the two `EnableAcceptEncoding`
 * flags put in the key, which is why a policy carrying no header at all still
 * caches a compressed object apart from an uncompressed one.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
 */
export function simCfManagedCachePolicies(): SimCloudFrontCachePolicyMap {
  const policies = [
    managedCachePolicy(simCfManagedCachePolicyIds.amplify, "Amplify", {
      minTtlSec: 2,
      defaultTtlSec: 2,
      maxTtlSec: 600,
      cacheKey: new SimCloudFrontCacheKey({
        cookieBehavior: "all",
        headerBehavior: "whitelist",
        headers: ["Authorization", "CloudFront-Viewer-Country", "Host"],
        queryStringBehavior: "all",
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      }),
    }),
    managedCachePolicy(
      simCfManagedCachePolicyIds.cachingOptimized,
      "CachingOptimized",
      {
        minTtlSec: 1,
        defaultTtlSec: daySeconds,
        maxTtlSec: yearSeconds,
        cacheKey: new SimCloudFrontCacheKey({
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        }),
      },
    ),
    managedCachePolicy(
      simCfManagedCachePolicyIds.cachingOptimizedForUncompressedObjects,
      "CachingOptimizedForUncompressedObjects",
      {
        minTtlSec: 1,
        defaultTtlSec: daySeconds,
        maxTtlSec: yearSeconds,
        cacheKey: new SimCloudFrontCacheKey(),
      },
    ),
    managedCachePolicy(
      simCfManagedCachePolicyIds.cachingDisabled,
      "CachingDisabled",
      {
        minTtlSec: 0,
        defaultTtlSec: 0,
        maxTtlSec: 0,
        cacheKey: new SimCloudFrontCacheKey(),
      },
    ),
    managedCachePolicy(
      simCfManagedCachePolicyIds.elementalMediaPackage,
      "Elemental-MediaPackage",
      {
        minTtlSec: 0,
        defaultTtlSec: daySeconds,
        maxTtlSec: yearSeconds,
        cacheKey: new SimCloudFrontCacheKey({
          headerBehavior: "whitelist",
          headers: ["Origin"],
          queryStringBehavior: "whitelist",
          queryStrings: ["aws.manifestfilter", "start", "end", "m"],
          enableAcceptEncodingGzip: true,
        }),
      },
    ),
    managedCachePolicy(
      simCfManagedCachePolicyIds.useOriginCacheControlHeaders,
      "UseOriginCacheControlHeaders",
      {
        minTtlSec: 0,
        defaultTtlSec: 0,
        maxTtlSec: yearSeconds,
        cacheKey: new SimCloudFrontCacheKey({
          cookieBehavior: "all",
          headerBehavior: "whitelist",
          headers: originCacheControlHeaders,
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        }),
      },
    ),
    managedCachePolicy(
      simCfManagedCachePolicyIds.useOriginCacheControlHeadersQueryStrings,
      "UseOriginCacheControlHeaders-QueryStrings",
      {
        minTtlSec: 0,
        defaultTtlSec: 0,
        maxTtlSec: yearSeconds,
        cacheKey: new SimCloudFrontCacheKey({
          cookieBehavior: "all",
          headerBehavior: "whitelist",
          headers: originCacheControlHeaders,
          queryStringBehavior: "all",
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        }),
      },
    ),
  ];

  return new Map(policies.map((policy) => [policy.id, policy]));
}

/**
 * One managed policy, under the ID, the name and the settings AWS gives it.
 */
function managedCachePolicy(
  id: string,
  name: string,
  settings: {
    readonly minTtlSec: number;
    readonly defaultTtlSec: number;
    readonly maxTtlSec: number;
    readonly cacheKey: SimCloudFrontCacheKey;
  },
): SimCloudFrontCachePolicy {
  return new SimCloudFrontCachePolicy({
    id: id as SimCloudFrontCachePolicyId,
    name,
    ...settings,
  });
}

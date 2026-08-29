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

/**
 * The seven managed cache policies, built fresh for one simulated CloudFront.
 *
 * CloudFront owns these and every account has them, so a Behavior can name one
 * without a template creating anything. Each carries the ID and the name AWS
 * publishes for it. The cache key and the TTLs behind each one are left out,
 * along with those of a policy a template creates.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
 */
export function simCfManagedCachePolicies(): SimCloudFrontCachePolicyMap {
  const policies = [
    managedCachePolicy(simCfManagedCachePolicyIds.amplify, "Amplify"),
    managedCachePolicy(
      simCfManagedCachePolicyIds.cachingOptimized,
      "CachingOptimized",
    ),
    managedCachePolicy(
      simCfManagedCachePolicyIds.cachingOptimizedForUncompressedObjects,
      "CachingOptimizedForUncompressedObjects",
    ),
    managedCachePolicy(
      simCfManagedCachePolicyIds.cachingDisabled,
      "CachingDisabled",
    ),
    managedCachePolicy(
      simCfManagedCachePolicyIds.elementalMediaPackage,
      "Elemental-MediaPackage",
    ),
    managedCachePolicy(
      simCfManagedCachePolicyIds.useOriginCacheControlHeaders,
      "UseOriginCacheControlHeaders",
    ),
    managedCachePolicy(
      simCfManagedCachePolicyIds.useOriginCacheControlHeadersQueryStrings,
      "UseOriginCacheControlHeaders-QueryStrings",
    ),
  ];

  return new Map(policies.map((policy) => [policy.id, policy]));
}

/**
 * One managed policy, under the ID and the name AWS gives it.
 */
function managedCachePolicy(
  id: string,
  name: string,
): SimCloudFrontCachePolicy {
  return new SimCloudFrontCachePolicy({
    id: id as SimCloudFrontCachePolicyId,
    name,
  });
}

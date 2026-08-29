import type { SimCloudFrontBehavior } from "../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontCachePolicy } from "../cache-policy/sim-cf-cache-policy.js";
import type { SimCloudFront } from "../sim-cloudfront.js";
import { simCfCacheEntryKey } from "./sim-cf-cache-entry-key.js";

interface SimCfCacheableRequestProperties {
  readonly cloudFront: SimCloudFront;
  readonly behaviour: SimCloudFrontBehavior;
  readonly request: Request;
  readonly edgeId: string;
}

/**
 * A request the Behavior caches, and what decides for how long.
 */
export interface SimCfCacheableRequest {
  /** The key the request is cached under. */
  readonly key: string;

  /**
   * The policy the key came from, whose TTLs settle how long the Origin's
   * answer is held.
   */
  readonly policy: SimCloudFrontCachePolicy;
}

/**
 * The key this request is cached under and the policy that decided it, or none
 * where the Behavior caches nothing.
 *
 * Three things stop a Behavior caching. Its cache policy may be one this
 * simulation does not hold, including the Behavior that names no policy at
 * all, and there is nothing to key on and no TTL that is not a guess. Its
 * policy may cache nothing, which is what a `MaxTTL` of zero says and is how
 * `CachingDisabled` reaches the Origin every time. Or the request's method may
 * be outside the Behavior's `CachedMethods`, which is CloudFront's own rule
 * that a POST is never served from a cache.
 */
export function simCfCacheableRequest(
  properties: SimCfCacheableRequestProperties,
): SimCfCacheableRequest | undefined {
  const { cloudFront, behaviour, request, edgeId } = properties;

  if (!cloudFront.cachingEnabled) {
    return undefined;
  }

  const policy =
    behaviour.cachePolicyId === undefined
      ? undefined
      : cloudFront.getCachePolicyById(behaviour.cachePolicyId);

  if (policy === undefined || policy.maxTtlSec <= 0) {
    return undefined;
  }

  if (!behaviour.cachedMethods.has(request.method.toUpperCase())) {
    return undefined;
  }

  return {
    key: simCfCacheEntryKey({ request, cacheKey: policy.cacheKey, edgeId }),
    policy,
  };
}

import type { SimCloudFrontBehavior } from "../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontCachePolicyRegistry } from "../cache-policy/sim-cf-cache-policy-registry.js";
import { SimCfForwardedToOrigin } from "./sim-cf-forwarded-to-origin.js";
import type { SimCloudFrontOriginRequestPolicyRegistry } from "./sim-cf-origin-request-policy-registry.js";

/**
 * The two policy registries a Behavior's forwarding is read from.
 *
 * They are asked per request rather than when the Distribution was configured,
 * so a policy a template replaced decides the next Origin request rather than
 * the one it replaced.
 */
export interface SimCfBehaviorPolicyRegistries {
  readonly cachePolicies: SimCloudFrontCachePolicyRegistry;
  readonly originRequestPolicies: SimCloudFrontOriginRequestPolicyRegistry;
}

/**
 * What one Behavior carries to its Origin, from the two policies it names.
 *
 * A Behavior naming a policy this simulation does not hold is read as naming
 * none, which is the same reading the Distribution's cache takes. Without
 * either registry there is nothing to read a policy from, and the Behavior
 * carries the same nothing.
 */
export function simCfBehaviorForwardedToOrigin(
  behaviour: SimCloudFrontBehavior,
  registries?: SimCfBehaviorPolicyRegistries,
): SimCfForwardedToOrigin {
  const cachePolicy =
    behaviour.cachePolicyId === undefined
      ? undefined
      : registries?.cachePolicies.byId(behaviour.cachePolicyId);
  const originRequestPolicy =
    behaviour.originRequestPolicyId === undefined
      ? undefined
      : registries?.originRequestPolicies.byId(behaviour.originRequestPolicyId);

  return new SimCfForwardedToOrigin({
    cacheKey: cachePolicy?.cacheKey,
    forwarding: originRequestPolicy?.forwarding,
  });
}

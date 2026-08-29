import type { SimCloudFrontCachePolicyRegistry } from "../../cache-policy/sim-cf-cache-policy-registry.js";
import { SimCloudFrontNoSuchCachePolicy } from "../../error/sim-cloudfront.error.js";

/**
 * Refuses a Cache Behavior naming a cache policy this simulation does not
 * hold.
 *
 * Real CloudFront checks this when the Distribution is created or updated, so
 * a template naming a mistyped policy ID fails the deploy there too, rather
 * than deploying successfully and only failing the first request that reaches
 * the Behavior.
 */
export class SimCfBehaviorCachePolicy {
  constructor(private readonly policies: SimCloudFrontCachePolicyRegistry) {}

  /**
   * Refuse one Behavior naming a policy which is not there.
   */
  assertExists(
    targetOriginId: string | undefined,
    cachePolicyId: string | undefined,
  ): void {
    if (
      cachePolicyId === undefined ||
      this.policies.byId(cachePolicyId) !== undefined
    ) {
      return;
    }

    throw new SimCloudFrontNoSuchCachePolicy(
      `Sim CloudFront Behavior for Origin ${targetOriginId} names cache ` +
        `policy ${cachePolicyId}, which does not exist. A Behavior names one ` +
        `of CloudFront's seven managed policies, or a policy an ` +
        `AWS::CloudFront::CachePolicy Resource created in this simulation. A ` +
        `policy ID from a real account is neither.`,
    );
  }
}

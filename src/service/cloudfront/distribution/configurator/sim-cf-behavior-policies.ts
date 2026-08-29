import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontDistributionConfig,
} from "../../command/create-distribution/create-distribution.command.js";
import type { SimCfBehaviorCachePolicy } from "./sim-cf-behavior-cache-policy.js";
import type { SimCfBehaviorOriginRequestPolicy } from "./sim-cf-behavior-origin-request-policy.js";
import type { SimCfBehaviorResponseHeadersPolicy } from "./sim-cf-behavior-response-headers-policy.js";

/**
 * The policies a Cache Behavior names, and whether this simulation holds them.
 *
 * A Behavior points at a response headers policy, a cache policy and an origin
 * request policy by ID, and all three live outside the Distribution. Each one
 * is checked the same way and at the same moment, so they are asked together.
 */
export class SimCfBehaviorPolicies {
  constructor(
    private readonly responseHeadersPolicy: SimCfBehaviorResponseHeadersPolicy,
    private readonly cachePolicy: SimCfBehaviorCachePolicy,
    private readonly originRequestPolicy: SimCfBehaviorOriginRequestPolicy,
  ) {}

  /**
   * Refuse every Behavior of a DistributionConfig that names a policy which is
   * not there, without touching the Distribution.
   *
   * An update replaces a Distribution's whole configuration, so this runs
   * before any of it is torn down. A refusal here leaves the Distribution
   * serving exactly what it served before, rather than half replaced.
   */
  assertAllExist(distributionConfig: SimCloudFrontDistributionConfig): void {
    const behaviors = [
      distributionConfig.DefaultCacheBehavior,
      ...(distributionConfig.CacheBehaviors?.Items ?? []),
    ];

    for (const behavior of behaviors) {
      if (behavior !== undefined) {
        this.assertExists(behavior);
      }
    }
  }

  /**
   * Refuse one Behavior naming a policy of any kind which is not there.
   */
  assertExists(
    behavior:
      | SimCloudFrontDefaultCacheBehaviorConfig
      | SimCloudFrontCacheBehaviorConfig,
  ): void {
    this.responseHeadersPolicy.assertExists(
      behavior.TargetOriginId,
      behavior.ResponseHeadersPolicyId,
    );
    this.cachePolicy.assertExists(
      behavior.TargetOriginId,
      behavior.CachePolicyId,
    );
    this.originRequestPolicy.assertExists(
      behavior.TargetOriginId,
      behavior.OriginRequestPolicyId,
    );
  }
}

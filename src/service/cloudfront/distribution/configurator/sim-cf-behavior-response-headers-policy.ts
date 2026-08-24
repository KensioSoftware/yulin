import type { SimCloudFrontDistributionConfig } from "../../command/create-distribution/create-distribution.command.js";
import { SimCloudFrontInvalidResponseHeadersPolicyId } from "../../error/sim-cloudfront.error.js";
import type { SimCloudFrontResponseHeadersPolicyRegistry } from "../../response-headers-policy/sim-cf-response-headers-policy-registry.js";

/**
 * Refuses a Cache Behavior naming a response headers policy this simulation
 * does not hold.
 *
 * Real CloudFront checks this when the Distribution is created or updated, so
 * a template naming a mistyped or AWS-managed policy ID fails the deploy there
 * too, rather than deploying successfully and only failing the first request
 * that reaches the Behavior.
 */
export class SimCfBehaviorResponseHeadersPolicy {
  constructor(
    private readonly policies: SimCloudFrontResponseHeadersPolicyRegistry,
  ) {}

  /**
   * Refuse every Behavior of a DistributionConfig that names a policy which is
   * not there, without touching the Distribution.
   *
   * An update replaces a Distribution's whole configuration, so this runs
   * before any of it is torn down: a refusal here leaves the Distribution
   * serving exactly what it served before, rather than half replaced.
   */
  assertAllExist(distributionConfig: SimCloudFrontDistributionConfig): void {
    const behaviors = [
      distributionConfig.DefaultCacheBehavior,
      ...(distributionConfig.CacheBehaviors?.Items ?? []),
    ];

    for (const behavior of behaviors) {
      if (behavior !== undefined) {
        this.assertExists(
          behavior.TargetOriginId,
          behavior.ResponseHeadersPolicyId,
        );
      }
    }
  }

  /**
   * Refuse one Behavior naming a policy which is not there.
   */
  assertExists(
    targetOriginId: string | undefined,
    responseHeadersPolicyId: string | undefined,
  ): void {
    if (
      responseHeadersPolicyId === undefined ||
      this.policies.byId(responseHeadersPolicyId) !== undefined
    ) {
      return;
    }

    throw new SimCloudFrontInvalidResponseHeadersPolicyId(
      `Sim CloudFront Behavior for Origin ${targetOriginId} names response ` +
        `headers policy ${responseHeadersPolicyId}, which does not exist. ` +
        `A Behavior names one of CloudFront's five managed policies, or a ` +
        `policy an AWS::CloudFront::ResponseHeadersPolicy Resource created in ` +
        `this simulation. A policy ID from a real account is neither.`,
    );
  }
}

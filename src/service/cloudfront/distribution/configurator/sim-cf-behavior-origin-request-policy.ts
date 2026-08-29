import { SimCloudFrontNoSuchOriginRequestPolicy } from "../../error/sim-cf-origin-request-policy.error.js";
import type { SimCloudFrontOriginRequestPolicyRegistry } from "../../origin-request-policy/sim-cf-origin-request-policy-registry.js";

/**
 * Refuses a Cache Behavior naming an origin request policy this simulation
 * does not hold.
 *
 * Real CloudFront checks this when the Distribution is created or updated, so
 * a template naming a mistyped policy ID fails the deploy there too, rather
 * than deploying successfully and only failing the first request that reaches
 * the Behavior.
 */
export class SimCfBehaviorOriginRequestPolicy {
  constructor(
    private readonly policies: SimCloudFrontOriginRequestPolicyRegistry,
  ) {}

  /**
   * Refuse one Behavior naming a policy which is not there.
   */
  assertExists(
    targetOriginId: string | undefined,
    originRequestPolicyId: string | undefined,
  ): void {
    if (
      originRequestPolicyId === undefined ||
      this.policies.byId(originRequestPolicyId) !== undefined
    ) {
      return;
    }

    throw new SimCloudFrontNoSuchOriginRequestPolicy(
      `Sim CloudFront Behavior for Origin ${targetOriginId} names origin ` +
        `request policy ${originRequestPolicyId}, which does not exist. A ` +
        `Behavior names one of CloudFront's eight managed policies, or a ` +
        `policy an AWS::CloudFront::OriginRequestPolicy Resource created in ` +
        `this simulation. A policy ID from a real account is neither.`,
    );
  }
}

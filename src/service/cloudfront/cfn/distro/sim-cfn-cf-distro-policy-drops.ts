import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFrontCacheBehaviorConfig } from "../../command/create-distribution/create-distribution.command.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";

/**
 * The policy properties a Behavior carries, in the terms a template writes
 * them in.
 */
type BehaviorPolicyProperty = "ResponseHeadersPolicyId" | "CachePolicyId";

/**
 * Takes a policy ID naming a policy this simulation does not hold off the
 * Behavior that named it, and records each one on the Resource.
 */
export class SimCfnCfDistroPolicyDrops {
  public count = 0;

  constructor(
    private readonly resource: SimCfnResource,
    private readonly cloudFront: SimCloudFront,
  ) {}

  /**
   * One Behavior, keeping the policies that are here and dropping those that
   * are not.
   */
  heldPolicies(
    behavior: SimCloudFrontCacheBehaviorConfig,
    behaviorPath: string,
  ): SimCloudFrontCacheBehaviorConfig {
    const withHeaders = this.heldPolicy(
      behavior,
      behaviorPath,
      "ResponseHeadersPolicyId",
      (policyId) =>
        this.cloudFront.getResponseHeadersPolicyById(policyId) !== undefined,
      headersPolicyDropReason,
    );

    return this.heldPolicy(
      withHeaders,
      behaviorPath,
      "CachePolicyId",
      (policyId) => this.cloudFront.getCachePolicyById(policyId) !== undefined,
      cachePolicyDropReason,
    );
  }

  /**
   * One policy property of one Behavior, dropped where the ID names nothing
   * this simulation holds.
   */
  private heldPolicy(
    behavior: SimCloudFrontCacheBehaviorConfig,
    behaviorPath: string,
    property: BehaviorPolicyProperty,
    held: (policyId: string) => boolean,
    reason: (policyId: string) => string,
  ): SimCloudFrontCacheBehaviorConfig {
    // oxlint-disable-next-line security/detect-object-injection
    const policyId = behavior[property];

    if (policyId === undefined || held(policyId)) {
      return behavior;
    }

    this.count += 1;
    this.resource.ignoreProperty(
      `${behaviorPath}.${property}`,
      reason(policyId),
    );

    return { ...behavior, [property]: undefined };
  }
}

/**
 * What a Behavior loses along with a response headers policy.
 */
function headersPolicyDropReason(policyId: string): string {
  return (
    `response headers policy ${policyId} is not held by this simulation, so ` +
    `the Behavior is deployed without one and serves every response without ` +
    `the headers that policy would have set`
  );
}

/**
 * What a Behavior loses along with a cache policy.
 */
function cachePolicyDropReason(policyId: string): string {
  return (
    `cache policy ${policyId} is not held by this simulation, so the ` +
    `Behavior is deployed without one and reports no CachePolicyId`
  );
}

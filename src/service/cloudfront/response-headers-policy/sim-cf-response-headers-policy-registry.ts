import { SimCloudFrontResponseHeadersPolicyAlreadyExists } from "../error/sim-cloudfront.error.js";
import type {
  SimCloudFrontResponseHeadersPolicy,
  SimCloudFrontResponseHeadersPolicyId,
  SimCloudFrontResponseHeadersPolicyMap,
} from "./sim-cf-response-headers-policy.js";

/**
 * The response headers policies one simulated CloudFront holds.
 *
 * Policies are found by ID, which is what a cache Behavior's
 * `responseHeadersPolicyId` names, and by name, which is what decides whether a
 * new one may be stored.
 */
export class SimCloudFrontResponseHeadersPolicyRegistry {
  private readonly policies: SimCloudFrontResponseHeadersPolicyMap = new Map();

  /**
   * Store a policy, refusing a name another policy already holds as CloudFront
   * does.
   */
  add(policy: SimCloudFrontResponseHeadersPolicy): void {
    if (this.byName(policy.name) !== undefined) {
      throw new SimCloudFrontResponseHeadersPolicyAlreadyExists(
        `Sim CloudFront response headers policy ${policy.name} already exists`,
      );
    }

    this.policies.set(policy.id, policy);
  }

  /**
   * Forget a policy.
   */
  remove(policyId: SimCloudFrontResponseHeadersPolicyId): void {
    this.policies.delete(policyId);
  }

  /**
   * Get a policy by ID.
   */
  byId(
    policyId: SimCloudFrontResponseHeadersPolicyId | string,
  ): SimCloudFrontResponseHeadersPolicy | undefined {
    return this.policies.get(policyId as SimCloudFrontResponseHeadersPolicyId);
  }

  /**
   * Get a policy by name.
   */
  byName(policyName: string): SimCloudFrontResponseHeadersPolicy | undefined {
    return this.policies.values().find((policy) => policy.name === policyName);
  }
}

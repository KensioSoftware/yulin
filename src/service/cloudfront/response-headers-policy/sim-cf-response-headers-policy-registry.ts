import { SimCloudFrontResponseHeadersPolicyAlreadyExists } from "../error/sim-cloudfront.error.js";
import { simCfManagedResponseHeadersPolicies } from "./sim-cf-managed-response-headers-policies.js";
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
 *
 * AWS's five managed policies are held apart from the ones a template creates.
 * CloudFront keeps them in its own namespace, so a template may create a policy
 * called `SecurityHeadersPolicy` of its own, and deleting the stack that
 * created it leaves the managed one where it was.
 */
export class SimCloudFrontResponseHeadersPolicyRegistry {
  private readonly policies: SimCloudFrontResponseHeadersPolicyMap = new Map();
  private readonly managedPolicies: SimCloudFrontResponseHeadersPolicyMap =
    simCfManagedResponseHeadersPolicies();

  /**
   * Store a policy a template created, refusing a name another such policy
   * already holds as CloudFront does.
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
   * Get a policy by ID, whether a template created it or AWS manages it.
   */
  byId(
    policyId: SimCloudFrontResponseHeadersPolicyId | string,
  ): SimCloudFrontResponseHeadersPolicy | undefined {
    const id = policyId as SimCloudFrontResponseHeadersPolicyId;

    return this.policies.get(id) ?? this.managedPolicies.get(id);
  }

  /**
   * Get a policy a template created, by name.
   *
   * A managed policy is left out. Its name belongs to CloudFront's own
   * namespace, and this is what decides whether a template may store a policy
   * under a name.
   */
  byName(policyName: string): SimCloudFrontResponseHeadersPolicy | undefined {
    return this.policies.values().find((policy) => policy.name === policyName);
  }
}

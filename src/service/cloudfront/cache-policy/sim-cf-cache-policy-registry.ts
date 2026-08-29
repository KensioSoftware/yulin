import { SimCloudFrontCachePolicyAlreadyExists } from "../error/sim-cloudfront.error.js";
import { simCfManagedCachePolicies } from "./sim-cf-managed-cache-policies.js";
import type {
  SimCloudFrontCachePolicy,
  SimCloudFrontCachePolicyId,
  SimCloudFrontCachePolicyMap,
} from "./sim-cf-cache-policy.js";

/**
 * The cache policies one simulated CloudFront holds.
 *
 * Policies are found by ID, which is what a cache Behavior's `cachePolicyId`
 * names, and by name, which is what decides whether a new one may be stored.
 *
 * AWS's seven managed policies are held apart from the ones a template
 * creates. CloudFront keeps them in its own namespace, so a template may
 * create a policy called `CachingDisabled` of its own, and deleting the stack
 * that created it leaves the managed one where it was.
 */
export class SimCloudFrontCachePolicyRegistry {
  private readonly policies: SimCloudFrontCachePolicyMap = new Map();
  private readonly managedPolicies: SimCloudFrontCachePolicyMap =
    simCfManagedCachePolicies();

  /**
   * Store a policy a template created, refusing a name another such policy
   * already holds as CloudFront does.
   */
  add(policy: SimCloudFrontCachePolicy): void {
    if (this.byName(policy.name) !== undefined) {
      throw new SimCloudFrontCachePolicyAlreadyExists(
        `Sim CloudFront cache policy ${policy.name} already exists`,
      );
    }

    this.policies.set(policy.id, policy);
  }

  /**
   * Forget a policy.
   */
  remove(policyId: SimCloudFrontCachePolicyId): void {
    this.policies.delete(policyId);
  }

  /**
   * Get a policy by ID, whether a template created it or AWS manages it.
   */
  byId(
    policyId: SimCloudFrontCachePolicyId | string,
  ): SimCloudFrontCachePolicy | undefined {
    const id = policyId as SimCloudFrontCachePolicyId;

    return this.policies.get(id) ?? this.managedPolicies.get(id);
  }

  /**
   * Get a policy a template created, by name.
   *
   * A managed policy is left out. Its name belongs to CloudFront's own
   * namespace, and this is what decides whether a template may store a policy
   * under a name.
   */
  byName(policyName: string): SimCloudFrontCachePolicy | undefined {
    return this.policies.values().find((policy) => policy.name === policyName);
  }
}

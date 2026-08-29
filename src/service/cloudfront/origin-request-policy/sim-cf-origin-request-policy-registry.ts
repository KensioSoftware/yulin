import { SimCloudFrontOriginRequestPolicyAlreadyExists } from "../error/sim-cf-origin-request-policy.error.js";
import { simCfManagedOriginRequestPolicies } from "./sim-cf-managed-origin-request-policies.js";
import type {
  SimCloudFrontOriginRequestPolicy,
  SimCloudFrontOriginRequestPolicyId,
  SimCloudFrontOriginRequestPolicyMap,
} from "./sim-cf-origin-request-policy.js";

/**
 * The origin request policies one simulated CloudFront holds.
 *
 * Policies are found by ID, which is what a cache Behavior's
 * `originRequestPolicyId` names, and by name, which is what decides whether a
 * new one may be stored.
 *
 * AWS's eight managed policies are held apart from the ones a template
 * creates. CloudFront keeps them in its own namespace, so a template may
 * create a policy called `AllViewer` of its own, and deleting the stack that
 * created it leaves the managed one where it was.
 */
export class SimCloudFrontOriginRequestPolicyRegistry {
  private readonly policies: SimCloudFrontOriginRequestPolicyMap = new Map();
  private readonly managedPolicies: SimCloudFrontOriginRequestPolicyMap =
    simCfManagedOriginRequestPolicies();

  /**
   * Store a policy a template created, refusing a name another such policy
   * already holds as CloudFront does.
   */
  add(policy: SimCloudFrontOriginRequestPolicy): void {
    if (this.byName(policy.name) !== undefined) {
      throw new SimCloudFrontOriginRequestPolicyAlreadyExists(
        `Sim CloudFront origin request policy ${policy.name} already exists`,
      );
    }

    this.policies.set(policy.id, policy);
  }

  /**
   * Forget a policy.
   */
  remove(policyId: SimCloudFrontOriginRequestPolicyId): void {
    this.policies.delete(policyId);
  }

  /**
   * Get a policy by ID, whether a template created it or AWS manages it.
   */
  byId(
    policyId: SimCloudFrontOriginRequestPolicyId | string,
  ): SimCloudFrontOriginRequestPolicy | undefined {
    const id = policyId as SimCloudFrontOriginRequestPolicyId;

    return this.policies.get(id) ?? this.managedPolicies.get(id);
  }

  /**
   * Get a policy a template created, by name.
   *
   * A managed policy is left out. Its name belongs to CloudFront's own
   * namespace, and this is what decides whether a template may store a policy
   * under a name.
   */
  byName(policyName: string): SimCloudFrontOriginRequestPolicy | undefined {
    return this.policies.values().find((policy) => policy.name === policyName);
  }
}

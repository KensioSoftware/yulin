import type { SimArn } from "../../../../aws/arn.js";
import type { SimIamPolicy } from "../../../policy/sim-iam-policy.js";
import { jsonParse } from "../../../../../util/type-guard/json.js";
import type { SimIamAuthZPolicySource } from "../sim-iam-auth-z-context.js";
import type { SimIamIdentityPolicyOwner } from "./sim-iam-id-pol-owner-resolver.js";

interface SimIamIdentityPolicyOwnerSourceBuilderProperties {
  readonly policies: ReadonlyMap<SimArn, SimIamPolicy>;
}

/**
 * Converts policies stored on an IAM role or user into authorization sources.
 *
 * IAM owners store inline policy documents directly and refer to managed
 * policies by ARN. Authorization evaluation uses one common policy-source
 * representation for both forms. This class owns the translation from those
 * storage models to that representation.
 *
 * Owner resolution remains outside this class. Callers must first identify the
 * role or user whose policies apply to the authenticated principal.
 */
export class SimIamIdentityPolicyOwnerSourceBuilder {
  private readonly policies: ReadonlyMap<SimArn, SimIamPolicy>;

  constructor(properties: SimIamIdentityPolicyOwnerSourceBuilderProperties) {
    this.policies = properties.policies;
  }

  /**
   * Build all available inline and managed policy sources for an IAM owner.
   */
  build(owner: SimIamIdentityPolicyOwner): readonly SimIamAuthZPolicySource[] {
    return [
      ...this.inlinePolicySources(owner),
      ...this.attachedPolicySources(owner),
    ];
  }

  /**
   * Parse policy documents stored directly on the role or user.
   *
   * Inline policy names come from the owning entity, so each generated source
   * retains the name needed for authorization diagnostics.
   */
  private inlinePolicySources(
    owner: SimIamIdentityPolicyOwner,
  ): readonly SimIamAuthZPolicySource[] {
    return [...owner.inlinePolicies].map(([policyName, policyDocument]) => ({
      sourceType: "identity-inline",
      policyName,
      document: jsonParse(policyDocument),
    }));
  }

  /**
   * Resolve attached policy ARNs through the account-scoped policy store.
   *
   * Attachment state and policy storage can exist independently in the
   * simulator. An ARN with no corresponding stored policy contributes no
   * authorization statements.
   */
  private attachedPolicySources(
    owner: SimIamIdentityPolicyOwner,
  ): readonly SimIamAuthZPolicySource[] {
    return [...owner.attachedPolicyArns]
      .map((policyArn) => this.policies.get(policyArn))
      .filter((policy): policy is SimIamPolicy => policy !== undefined)
      .flatMap((policy) => this.managedPolicySource(policy));
  }

  /**
   * Convert a managed policy when it has a document available for evaluation.
   *
   * A managed policy record without a document contributes no source. This
   * matches missing attached policies: neither case supplies statements to the
   * authorization decision.
   */
  private managedPolicySource(
    policy: SimIamPolicy,
  ): readonly SimIamAuthZPolicySource[] {
    if (policy.policyDocument === undefined) {
      return [];
    }

    return [
      {
        sourceType: "identity-managed",
        policyArn: policy.arn,
        policyName: policy.policyName,
        document: jsonParse(policy.policyDocument),
      },
    ];
  }
}

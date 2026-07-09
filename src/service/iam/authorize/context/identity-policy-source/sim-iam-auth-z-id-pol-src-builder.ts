import type { SimArn } from "../../../../aws/arn.js";
import type { SimIamPolicy } from "../../../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import { jsonParse } from "../../../../../util/type-guard/json.js";
import type { SimIamAuthZPolicySource } from "../sim-iam-auth-z-context.js";

interface SimIamAuthZIdentityPolicySourceBuilderProps {
  policies: ReadonlyMap<SimArn, SimIamPolicy>;
  roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
}

/**
 * Builds identity policy sources for an IAM authorization context.
 *
 * IAM identity authorization can collect policy documents from more than one
 * storage location. Roles may carry inline policies directly on the role, and
 * they may reference managed policies by ARN. Keeping that lookup and document
 * conversion here prevents SimIamAuthZContextBuilder from mixing context
 * assembly with role-specific policy resolution.
 *
 * The builder currently supports IAM roles because the simulator only has role
 * identity-policy authorization wired through this path. If user or
 * assumed-role identity policies are added later, this class is the narrow
 * extension point for resolving those principal shapes.
 */
export class SimIamAuthZIdentityPolicySourceBuilder {
  private readonly policies: ReadonlyMap<SimArn, SimIamPolicy>;
  private readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;

  constructor(props: SimIamAuthZIdentityPolicySourceBuilderProps) {
    this.policies = props.policies;
    this.roles = props.roles;
  }

  /**
   * Return the policy sources attached to the principal ARN.
   *
   * The incoming principal is optional because some authorization checks are made
   * without an IAM identity. In that case there are no identity policies to
   * evaluate, but resource policies may still contribute to the final decision.
   */
  build(principal: string | undefined): readonly SimIamAuthZPolicySource[] {
    const principalRole = this.principalRole(principal);

    if (principalRole === undefined) {
      return [];
    }

    return [
      ...this.inlinePolicySources(principalRole),
      ...this.attachedPolicySources(principalRole),
    ];
  }

  /**
   * Resolve a principal ARN to the simulated IAM role that owns the identity
   * policies.
   *
   * Roles are keyed by role name in the IAM store, while authorization input uses
   * a principal ARN. The scan bridges those two representations without changing
   * the storage map used by command handlers.
   */
  private principalRole(principal: string | undefined): SimIamRole | undefined {
    if (principal === undefined) {
      return undefined;
    }

    return [...this.roles.values()].find((role) => role.arn === principal);
  }

  /**
   * Convert inline role policies into authorization policy sources.
   *
   * Inline policies are stored on the role as serialized JSON documents. The
   * authorizer consumes parsed policy documents, so this step is the boundary
   * where role storage format becomes authorization input format.
   */
  private inlinePolicySources(
    role: SimIamRole,
  ): readonly SimIamAuthZPolicySource[] {
    return [...role.inlinePolicies.entries()].map(
      ([policyName, policyDocument]) => ({
        sourceType: "identity-inline",
        policyName,
        document: jsonParse(policyDocument),
      }),
    );
  }

  /**
   * Resolve attached managed policy ARNs and convert each available policy
   * document into an authorization source.
   *
   * Missing policy ARNs are ignored here because policy attachment state can be
   * represented independently of policy document storage in the simulator. A
   * missing document contributes no statements to the authorization decision.
   */
  private attachedPolicySources(
    role: SimIamRole,
  ): readonly SimIamAuthZPolicySource[] {
    return [...role.attachedPolicyArns]
      .map((policyArn) => this.policies.get(policyArn))
      .filter((policy): policy is SimIamPolicy => policy !== undefined)
      .flatMap((policy) => this.managedPolicySource(policy));
  }

  /**
   * Convert one managed policy into a policy source when it has a default
   * policy document available for evaluation.
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

import type { SimArn } from "../../../aws/arn.js";
import type {
  SimIamPolicy,
  SimIamPolicyDocument,
} from "../../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import type {
  SimIamAuthZContext,
  SimIamAuthZPolicySource,
} from "./sim-iam-auth-z-context.js";
import { SimIamAuthZIdentityPolicySourceBuilder } from "./identity-policy-source/sim-iam-auth-z-id-pol-src-builder.js";

/**
 * Entry-point input for sim IAM allow/deny authorization.
 */
export interface SimIamAuthorizationInput {
  readonly action: string;
  readonly resource: string;
  readonly principal?: string | undefined;
  readonly resourcePolicies?: readonly SimIamPolicyDocument[] | undefined;
}

/**
 * Builds the authorization context consumed by SimIamAuthorizer.
 *
 * This class keeps the final context assembly in one place: action, resource,
 * principal, identity policy sources, and resource policy sources are combined
 * into the shape expected by the authorizer.
 *
 * Role identity-policy resolution is delegated to
 * SimIamAuthZIdentityPolicySourceBuilder. That helper owns the details of
 * finding a principal role, reading inline policies from the role, resolving
 * attached managed policy ARNs, and parsing stored policy documents.
 *
 * Resource policies are supplied by the service that owns the target resource.
 * They are passed through the authorization input rather than loaded from the
 * IAM role or managed-policy stores.
 *
 * Permissions boundaries, session policies, SCPs, and role trust-policy
 * assume-role semantics are not part of this context assembly path yet. Add
 * those concerns through separate policy-source builders so this class stays
 * focused on composing the authorization request.
 */
export class SimIamAuthZContextBuilder {
  private readonly identityPolicySourceBuilder: SimIamAuthZIdentityPolicySourceBuilder;

  constructor(
    policies: ReadonlyMap<SimArn, SimIamPolicy>,
    roles: ReadonlyMap<SimIamRoleName, SimIamRole>,
  ) {
    this.identityPolicySourceBuilder =
      new SimIamAuthZIdentityPolicySourceBuilder({ policies, roles });
  }

  /**
   * Build the context consumed by SimIamAuthorizer.
   */
  build(input: SimIamAuthorizationInput): SimIamAuthZContext {
    return {
      identityPolicies: this.identityPolicySourceBuilder.build(input.principal),
      resourcePolicies: this.resourcePolicySources(input),
      action: input.action,
      resource: input.resource,
      principal: input.principal,
    };
  }

  /**
   * Convert resource policy documents supplied by the resource-owning service into
   * authorization policy sources.
   *
   * Resource policies are not stored in the IAM role or managed-policy maps. They
   * arrive with the authorization request because ownership depends on the target
   * service, such as S3 bucket policies or other service-level policy documents.
   */
  private resourcePolicySources(
    input: SimIamAuthorizationInput,
  ): readonly SimIamAuthZPolicySource[] {
    return (input.resourcePolicies ?? []).map((document) => ({
      sourceType: "resource",
      document,
    }));
  }
}

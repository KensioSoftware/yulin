import type { SimArn } from "../../../aws/arn.js";
import type {
  SimAwsCaller,
  SimAwsPrincipal,
} from "../../../aws/caller/sim-aws-caller.js";
import type {
  SimIamConditionValue,
  SimIamPolicy,
  SimIamPolicyDocument,
} from "../../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import type {
  SimIamAuthZContext,
  SimIamAuthZPolicySource,
  SimIamAuthZPolicySourceType,
} from "./sim-iam-auth-z-context.js";
import { SimIamAuthZIdentityPolicyCoordinator } from "./identity-policy-source/sim-iam-auth-z-id-pol-coordinator.js";
import { SimIamAuthZCallerContextBuilder } from "./sim-iam-auth-z-caller-context-builder.js";
import type {
  SimAwsCredentialIdentityResolver,
  SimAwsResolvedCaller,
} from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamUser, SimIamUsername } from "../../user/sim-iam-user.js";

export interface SimIamResourcePolicyInput {
  readonly document: SimIamPolicyDocument;
  readonly sourceType?: Extract<
    SimIamAuthZPolicySourceType,
    "resource" | "trust"
  >;
  readonly policyName?: string | undefined;
  readonly resourceArn?: string | undefined;
}

/**
 * Entry-point input for sim IAM allow/deny authorization.
 */
export interface SimIamAuthorizationInput {
  readonly action: string;
  readonly resource: string;

  /**
   * Condition values known by the service handling the simulated request, such
   * as S3 object tags. Sim IAM automatically supplies global condition values
   * that it can derive itself, such as aws:PrincipalArn.
   *
   * Context-key names are matched case-insensitively by the condition matcher,
   * while string values remain case-sensitive. IAM-derived values take
   * precedence over supplied values for equivalent keys.
   */
  readonly conditionContext?:
    Readonly<Record<string, SimIamConditionValue>> | undefined;

  /**
   * Simulated request caller.
   *
   * If credentials are supplied, they are authenticated before policy
   * evaluation. If omitted, authorization defaults to the Account root.
   */
  readonly caller?: SimAwsCaller | undefined;

  /**
   * Resource policies supplied by the service that owns the target resource.
   *
   * Resource policies are not loaded from IAM's managed-policy store. They are
   * supplied by the target service, such as an S3 Bucket policy or other
   * service-level resource policy.
   */
  readonly resourcePolicies?: readonly SimIamResourcePolicyInput[] | undefined;
}

/**
 * Builds the authorization context consumed by SimIamAuthorizer.
 *
 * This class keeps the final context assembly in one place: action, resource,
 * caller principal, identity policy sources, and resource policy sources are
 * combined into the shape expected by the authorizer.
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
  private readonly callerContextBuilder: SimIamAuthZCallerContextBuilder;
  private readonly identityPolicyCoordinator: SimIamAuthZIdentityPolicyCoordinator;

  constructor(
    policies: ReadonlyMap<SimArn, SimIamPolicy>,
    roles: ReadonlyMap<SimIamRoleName, SimIamRole>,
    users: ReadonlyMap<SimIamUsername, SimIamUser>,
    defaultCallerPrincipal: SimAwsPrincipal,
    credentialIdentityResolver: SimAwsCredentialIdentityResolver,
  ) {
    this.callerContextBuilder = new SimIamAuthZCallerContextBuilder(
      defaultCallerPrincipal,
      credentialIdentityResolver,
    );
    this.identityPolicyCoordinator = new SimIamAuthZIdentityPolicyCoordinator({
      policies,
      roles,
      users,
    });
  }

  /**
   * Build the context consumed by SimIamAuthorizer.
   */
  build(input: SimIamAuthorizationInput): SimIamAuthZContext {
    const callerContext = this.callerContextBuilder.build(input.caller);

    return {
      identityPolicies: [
        ...this.identityPolicyCoordinator.build(
          callerContext.caller.identityPolicyArn,
        ),
        ...callerContext.rootPolicySources,
      ],
      resourcePolicies: this.resourcePolicySources(input),
      action: input.action,
      resource: input.resource,
      conditionContext: this.conditionContext(input, callerContext.caller),
      caller: callerContext.caller,
    };
  }

  /**
   * Combine service-provided condition values with global values that IAM can
   * derive from the resolved caller. aws:PrincipalArn identifies the IAM
   * identity whose policies apply; for temporary Role credentials this is the
   * underlying Role ARN, rather than the STS assumed-role session ARN retained
   * as the effective caller for diagnostics.
   */
  private conditionContext(
    input: SimIamAuthorizationInput,
    caller: SimAwsResolvedCaller,
  ): Readonly<Record<string, SimIamConditionValue>> {
    const principalArn = caller.identityPolicyArn ?? caller.arn;

    if (principalArn === undefined) {
      return input.conditionContext ?? {};
    }

    return {
      ...input.conditionContext,
      "aws:PrincipalArn": principalArn,
    };
  }

  /**
   * Convert resource policies supplied by the resource-owning service into
   * authorization policy sources.
   *
   * Resource policies are not stored in the IAM role or managed-policy maps.
   * They arrive with the authorization request because ownership depends on the
   * target service, such as S3 bucket policies or other service-level policy
   * documents.
   */
  private resourcePolicySources(
    input: SimIamAuthorizationInput,
  ): readonly SimIamAuthZPolicySource[] {
    return (input.resourcePolicies ?? []).map((policy) => ({
      sourceType: policy.sourceType ?? "resource",
      document: policy.document,
      policyName: policy.policyName,
      resourceArn: policy.resourceArn,
    }));
  }
}

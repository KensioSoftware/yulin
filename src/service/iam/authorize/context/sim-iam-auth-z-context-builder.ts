import type { SimArn } from "../../../aws/arn.js";
import { makeSimAwsAccountRootPrincipal } from "../../../aws/caller/sim-aws-account-root-principal.js";
import type {
  SimAwsDefaultCaller,
  SimAwsPrincipal,
} from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamCallerAccountResolver } from "../caller-account/sim-iam-caller-account-resolver.js";
import { SimIamAuthZAllowRequirement } from "./sim-iam-auth-z-allow-requirement.js";
import type { SimIamAccountResolver } from "../../registry/sim-iam-account-resolver.js";
import type {
  SimIamConditionValue,
  SimIamPolicy,
} from "../../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import type {
  SimIamAuthZContext,
  SimIamAuthZPolicySource,
} from "./sim-iam-auth-z-context.js";
import type { SimIamAuthorizationInput } from "./sim-iam-auth-z-input.js";
import { SimIamAuthZIdentityPolicyCoordinator } from "./identity-policy-source/sim-iam-auth-z-id-pol-coordinator.js";
import {
  SimIamAuthZCallerContextBuilder,
  type SimIamAuthZCallerContext,
} from "./sim-iam-auth-z-caller-context-builder.js";
import type {
  SimAwsCredentialIdentityResolver,
  SimAwsResolvedCaller,
} from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamUser, SimIamUsername } from "../../user/sim-iam-user.js";
import { SimIamAuthZScpSourceBuilder } from "./sim-iam-auth-z-scp-source-builder.js";
import { SimIamDerivedConditions } from "./sim-iam-derived-conditions.js";
import type { SimIamServiceControlPolicyResolver } from "../scp/sim-iam-scp-resolver.js";

interface SimIamAuthZContextBuilderProperties {
  /**
   * The Account whose IAM is evaluating the request.
   */
  readonly accountId: SimAwsAccountId;

  readonly policies: ReadonlyMap<SimArn, SimIamPolicy>;
  readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
  readonly users: ReadonlyMap<SimIamUsername, SimIamUser>;
  readonly credentialIdentityResolver: SimAwsCredentialIdentityResolver;

  readonly defaultCaller?: SimAwsDefaultCaller | undefined;

  /**
   * Resolves other Accounts' IAM in the same simulation, for the identity side
   * of a cross-Account request.
   */
  readonly iamResolver?: SimIamAccountResolver | undefined;

  /**
   * Resolves the service control policies in force for an Account. A
   * standalone SimIam has no organization around it and leaves this out.
   */
  readonly scpResolver?: SimIamServiceControlPolicyResolver | undefined;
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
 * Whose identity policies are in scope depends on which Account owns the
 * caller, which SimIamCallerAccountResolver decides. A caller from another
 * Account brings that Account's identity policies with it, along with the rule
 * that both sides must then allow the request.
 *
 * Resource policies are supplied by the service that owns the target resource.
 * They are passed through the authorization input rather than loaded from the
 * IAM role or managed-policy stores.
 *
 * Service control policies come from the organization the caller's Account
 * belongs to, read by SimIamAuthZScpSourceBuilder. They filter and grant
 * nothing, so they travel apart from the sides that can allow a request.
 *
 * Permissions boundaries, session policies, and role trust-policy assume-role
 * semantics are not part of this context assembly path yet. Add those concerns
 * through separate policy-source builders so this class stays focused on
 * composing the authorization request.
 */
export class SimIamAuthZContextBuilder {
  private readonly callerContextBuilder: SimIamAuthZCallerContextBuilder;
  private readonly identityPolicyCoordinator: SimIamAuthZIdentityPolicyCoordinator;
  private readonly callerAccountResolver: SimIamCallerAccountResolver;
  private readonly allowRequirement = new SimIamAuthZAllowRequirement();
  private readonly derivedConditions = new SimIamDerivedConditions();
  private readonly scpSourceBuilder: SimIamAuthZScpSourceBuilder;

  constructor(properties: SimIamAuthZContextBuilderProperties) {
    this.callerContextBuilder = new SimIamAuthZCallerContextBuilder({
      accountRootPrincipal: makeSimAwsAccountRootPrincipal(
        properties.accountId,
      ),
      credentialIdentityResolver: properties.credentialIdentityResolver,
      defaultCaller: properties.defaultCaller,
    });
    this.identityPolicyCoordinator = new SimIamAuthZIdentityPolicyCoordinator({
      policies: properties.policies,
      roles: properties.roles,
      users: properties.users,
    });
    this.callerAccountResolver = new SimIamCallerAccountResolver({
      accountId: properties.accountId,
      iamResolver: properties.iamResolver,
    });
    this.scpSourceBuilder = new SimIamAuthZScpSourceBuilder({
      accountId: properties.accountId,
      scpResolver: properties.scpResolver,
    });
  }

  /**
   * Build the context consumed by SimIamAuthorizer.
   */
  build(input: SimIamAuthorizationInput): SimIamAuthZContext {
    const callerContext = this.callerContextBuilder.build(input.caller);
    const callerAccount = this.callerAccountResolver.resolve(
      callerContext.caller,
    );

    return {
      identityPolicies: [
        ...this.ownIdentityPolicySources(callerContext),
        ...callerAccount.identityPolicies,
      ],
      resourcePolicies: this.resourcePolicySources(input),
      serviceControlPolicies: this.scpSourceBuilder.build(callerContext.caller),
      allowRequirement: this.allowRequirement.resolve(callerAccount, input),
      action: input.action,
      resource: input.resource,
      conditionContext: this.conditionContext(input, callerContext.caller),
      caller: callerContext.caller,
    };
  }

  /**
   * Identity policy sources this Account applies to one of its own principals.
   *
   * This is the identity side of a request within one Account, and is also what
   * another Account's IAM asks for when it is deciding a cross-Account request
   * against a principal belonging to this one.
   */
  identityPolicySourcesFor(
    principal: SimAwsPrincipal,
  ): readonly SimIamAuthZPolicySource[] {
    return this.ownIdentityPolicySources(
      this.callerContextBuilder.build(principal),
    );
  }

  /**
   * Combine stored identity policies with any implied by the caller itself,
   * such as the unrestricted access held by this Account's root principal.
   */
  private ownIdentityPolicySources(
    callerContext: SimIamAuthZCallerContext,
  ): readonly SimIamAuthZPolicySource[] {
    return [
      ...this.identityPolicyCoordinator.build(
        callerContext.caller.identityPolicyArn,
      ),
      ...callerContext.rootPolicySources,
    ];
  }

  /**
   * Combine service-provided condition values with the global values IAM
   * derives itself.
   *
   * A service supplies values it knows from the request, and values it can
   * only work out once the caller is resolved. IAM's own values are applied
   * last, so nothing a service supplies can overwrite them.
   */
  private conditionContext(
    input: SimIamAuthorizationInput,
    caller: SimAwsResolvedCaller,
  ): Readonly<Record<string, SimIamConditionValue>> {
    return {
      ...input.conditionContext,
      ...input.callerConditions?.conditionValuesFor(caller),
      ...this.derivedConditions.of({ caller, region: input.region }),
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

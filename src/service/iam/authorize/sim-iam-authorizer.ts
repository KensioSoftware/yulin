import type { SimArn } from "../../aws/arn.js";
import type { SimIamPolicy } from "../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../role/sim-iam-role.js";
import {
  SimIamAuthZContextBuilder,
  type SimIamAuthorizationInput,
} from "./context/sim-iam-auth-z-context-builder.js";
import { SimIamPolicyDecision } from "./sim-iam-decision.js";
import type {
  SimAwsDefaultCaller,
  SimAwsPrincipal,
} from "../../aws/caller/sim-aws-caller.js";
import type { SimIamUser, SimIamUsername } from "../user/sim-iam-user.js";
import type { SimAwsCredentialIdentityResolver } from "../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIamAccountResolver } from "../registry/sim-iam-account-resolver.js";
import type { SimIamAuthZPolicySource } from "./context/sim-iam-auth-z-context.js";
import type { SimIamAccountIdentityPolicies } from "./identity/sim-iam-account-identity-policies.js";
import type { SimIamServiceControlPolicyResolver } from "./scp/sim-iam-scp-resolver.js";

interface SimIamAuthorizerProperties {
  readonly accountId: SimAwsAccountId;
  readonly policies: ReadonlyMap<SimArn, SimIamPolicy>;
  readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
  readonly users: ReadonlyMap<SimIamUsername, SimIamUser>;
  readonly credentialIdentityResolver: SimAwsCredentialIdentityResolver;
  readonly defaultCaller?: SimAwsDefaultCaller | undefined;
  readonly iamResolver?: SimIamAccountResolver | undefined;
  readonly scpResolver?: SimIamServiceControlPolicyResolver | undefined;
}

/**
 * Facade for simulated IAM authorization decisions.
 *
 * This class represents the service-facing entry point for IAM authorization.
 * It assembles the authorization context from IAM state and request input, while
 * each SimIamPolicyDecision instance keeps the state and diagnostics for one
 * evaluated authorization attempt.
 */
export class SimIamAuthorizer implements SimIamAccountIdentityPolicies {
  private readonly contextBuilder: SimIamAuthZContextBuilder;

  constructor(properties: SimIamAuthorizerProperties) {
    this.contextBuilder = new SimIamAuthZContextBuilder({
      accountId: properties.accountId,
      policies: properties.policies,
      roles: properties.roles,
      users: properties.users,
      credentialIdentityResolver: properties.credentialIdentityResolver,
      defaultCaller: properties.defaultCaller,
      iamResolver: properties.iamResolver,
      scpResolver: properties.scpResolver,
    });
  }

  /**
   * Evaluate an IAM authorization request.
   */
  authorize(input: SimIamAuthorizationInput): SimIamPolicyDecision {
    return new SimIamPolicyDecision(this.contextBuilder.build(input));
  }

  /**
   * Identity policies this Account applies to one of its own principals.
   */
  identityPolicySourcesFor(
    principal: SimAwsPrincipal,
  ): readonly SimIamAuthZPolicySource[] {
    return this.contextBuilder.identityPolicySourcesFor(principal);
  }
}

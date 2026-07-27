import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimArn } from "../../aws/arn.js";
import type { SimAwsCredentialIdentityResolver } from "../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamManagedPolicy } from "../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../role/sim-iam-role.js";
import type { SimIamUser, SimIamUsername } from "../user/sim-iam-user.js";
import type { SimIamAccountResolver } from "../registry/sim-iam-account-resolver.js";
import { SimIamAuthorizer } from "./sim-iam-authorizer.js";
import type { SimIamAuthorizationInput } from "./context/sim-iam-auth-z-context-builder.js";
import type { SimIamAuthZPolicySource } from "./context/sim-iam-auth-z-context.js";
import type { SimIamAccountIdentityPolicies } from "./identity/sim-iam-account-identity-policies.js";
import type { SimIamPolicyDecision } from "./sim-iam-decision.js";

interface SimIamAccountAuthZProperties {
  readonly accountId: SimAwsAccountId;
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly credentialIdentityResolver: SimAwsCredentialIdentityResolver;

  /**
   * Resolves other Accounts' IAM in the same simulation.
   *
   * A cross-Account request is decided in both Accounts, so the caller's own
   * Account has to be reachable for its identity policies to count. A
   * standalone SimIam has no simulation around it and so no resolver.
   */
  readonly iamResolver?: SimIamAccountResolver | undefined;
}

/**
 * Evaluates IAM authorization attempts against one simulated Account's IAM
 * state.
 *
 * If the caller is omitted, authorization defaults to the root principal of
 * the owning sim Account. An explicit anonymous caller suppresses that
 * fallback and is evaluated without identity policies.
 */
export class SimIamAccountAuthZ implements SimIamAccountIdentityPolicies {
  private readonly properties: SimIamAccountAuthZProperties;

  constructor(properties: SimIamAccountAuthZProperties) {
    this.properties = properties;
  }

  /**
   * Evaluate an IAM authorization attempt against policies relevant to the
   * request caller.
   */
  authorize(input: SimIamAuthorizationInput): SimIamPolicyDecision {
    return this.authorizer().authorize(input);
  }

  /**
   * Identity policies this Account applies to one of its own principals.
   */
  identityPolicySourcesFor(
    principal: SimAwsPrincipal,
  ): readonly SimIamAuthZPolicySource[] {
    return this.authorizer().identityPolicySourcesFor(principal);
  }

  /**
   * Make an authorizer over this Account's current IAM state.
   *
   * The state maps are shared by reference, so a fresh authorizer sees every
   * Role, User, and Policy created since the last request.
   */
  private authorizer(): SimIamAuthorizer {
    return new SimIamAuthorizer({
      accountId: this.properties.accountId,
      policies: this.properties.policies,
      roles: this.properties.roles,
      users: this.properties.users,
      credentialIdentityResolver: this.properties.credentialIdentityResolver,
      iamResolver: this.properties.iamResolver,
    });
  }
}

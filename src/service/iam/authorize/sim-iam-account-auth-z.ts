import { makeSimAwsAccountRootPrincipal } from "../../aws/caller/sim-aws-account-root-principal.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimArn } from "../../aws/arn.js";
import type { SimAwsCredentialIdentityResolver } from "../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamManagedPolicy } from "../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../role/sim-iam-role.js";
import type { SimIamUser, SimIamUsername } from "../user/sim-iam-user.js";
import { SimIamAuthorizer } from "./sim-iam-authorizer.js";
import type { SimIamAuthorizationInput } from "./context/sim-iam-auth-z-context-builder.js";
import type { SimIamPolicyDecision } from "./sim-iam-decision.js";

interface SimIamAccountAuthZProperties {
  readonly accountId: SimAwsAccountId;
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly credentialIdentityResolver: SimAwsCredentialIdentityResolver;
}

/**
 * Evaluates IAM authorization attempts against one simulated Account's IAM
 * state.
 *
 * If the caller is omitted, authorization defaults to the root principal of
 * the owning sim Account. An explicit anonymous caller suppresses that
 * fallback and is evaluated without identity policies.
 */
export class SimIamAccountAuthZ {
  private readonly properties: SimIamAccountAuthZProperties;

  constructor(properties: SimIamAccountAuthZProperties) {
    this.properties = properties;
  }

  /**
   * Evaluate an IAM authorization attempt against policies relevant to the
   * request caller.
   */
  authorize(input: SimIamAuthorizationInput): SimIamPolicyDecision {
    const simIamAuthorizer = new SimIamAuthorizer({
      policies: this.properties.policies,
      roles: this.properties.roles,
      users: this.properties.users,
      defaultCallerPrincipal: makeSimAwsAccountRootPrincipal(
        this.properties.accountId,
      ),
      credentialIdentityResolver: this.properties.credentialIdentityResolver,
    });
    return simIamAuthorizer.authorize(input);
  }
}

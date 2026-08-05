import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimArn } from "../../aws/arn.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimIamActionAuthorizer } from "../authorize/sim-iam-action-authorizer.js";
import type { SimIamInterServiceAuthZ } from "../authorize/sim-iam-inter-service-auth-z.js";
import type { SimIamCredentialRegistry } from "../credential/sim-iam-credential-registry.js";
import type { SimIamUserCredentialGenerator } from "../credential/user/sim-iam-user-credential-generator.js";
import type { SimIamManagedPolicy } from "../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../role/sim-iam-role.js";
import type { SimIamUser, SimIamUsername } from "../user/sim-iam-user.js";
import { SimIamPolicyCommandHandlers } from "./policy/sim-iam-policy-command-handlers.js";
import { SimIamRoleCommandHandlers } from "./role/sim-iam-role-command-handlers.js";
import { SimIamUserCommandHandlers } from "./user/sim-iam-user-command-handlers.js";

interface SimIamCommandHandlersProperties {
  readonly accountId: SimAwsAccountId;
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly credentialRegistry: SimIamCredentialRegistry;
  readonly userCredentialGenerator: SimIamUserCredentialGenerator;
  readonly background: BackgroundScheduler;

  /**
   * IAM itself, which authorizes its own control-plane commands.
   */
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * The command handlers of one simulated IAM Account, grouped by resource.
 *
 * Every group authorizes against the same IAM and mutates the same Account
 * state, so they are wired together here rather than one at a time in the
 * service facade. That keeps SimIam what it should be: state maps plus
 * delegation.
 */
export class SimIamCommandHandlers {
  readonly roles: SimIamRoleCommandHandlers;
  readonly users: SimIamUserCommandHandlers;
  readonly policies: SimIamPolicyCommandHandlers;

  constructor(properties: SimIamCommandHandlersProperties) {
    const authorizer = new SimIamActionAuthorizer({ iam: properties.iam });

    this.roles = new SimIamRoleCommandHandlers({
      accountId: properties.accountId,
      roles: properties.roles,
      background: properties.background,
      authorizer,
    });
    this.users = new SimIamUserCommandHandlers({
      accountId: properties.accountId,
      users: properties.users,
      credentialRegistry: properties.credentialRegistry,
      credentialGenerator: properties.userCredentialGenerator,
      background: properties.background,
      authorizer,
    });
    this.policies = new SimIamPolicyCommandHandlers({
      accountId: properties.accountId,
      policies: properties.policies,
      roles: properties.roles,
      users: properties.users,
      background: properties.background,
      authorizer,
    });
  }
}

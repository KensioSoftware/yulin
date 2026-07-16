import type { SimArn } from "../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { CreatePolicyCommandHandler } from "./command/policy/create-policy/create-policy.handler.js";
import type {
  SimCreatePolicyCommand,
  SimCreatePolicyCommandOutput,
} from "./command/policy/create-policy/create-policy.cmd.js";
import type { SimIamManagedPolicy } from "./policy/sim-iam-policy.js";
import { GetPolicyCommandHandler } from "./command/policy/get-policy/get-policy.handler.js";
import type {
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput,
} from "./command/policy/get-policy/get-policy.cmd.js";
import type {
  SimListPoliciesCommand,
  SimListPoliciesCommandOutput,
} from "./command/policy/list-policies/list-policies.cmd.js";
import { ListPoliciesCommandHandler } from "./command/policy/list-policies/list-policies.handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type {
  SimCreateRoleCommand,
  SimCreateRoleCommandOutput,
} from "./command/role/create-role/create-role.cmd.js";
import { CreateRoleCommandHandler } from "./command/role/create-role/create-role.handler.js";
import type {
  SimGetRoleCommand,
  SimGetRoleCommandOutput,
} from "./command/role/get-role/get-role.cmd.js";
import { GetRoleCommandHandler } from "./command/role/get-role/get-role.handler.js";
import type { SimIamRole, SimIamRoleName } from "./role/sim-iam-role.js";
import type {
  SimListRolesCommand,
  SimListRolesCommandOutput,
} from "./command/role/list-roles/list-roles.cmd.js";
import { ListRolesCommandHandler } from "./command/role/list-roles/list-roles.handler.js";
import type { SimIamAuthorizationInput } from "./authorize/context/sim-iam-auth-z-context-builder.js";
import type { SimIamPolicyDecision } from "./authorize/sim-iam-decision.js";
import { SimIamAuthorizer } from "./authorize/sim-iam-authorizer.js";
import type {
  SimPutRolePolicyCommand,
  SimPutRolePolicyCommandOutput,
} from "./command/policy/put-role-policy/put-role-policy.cmd.js";
import { PutRolePolicyCommandHandler } from "./command/policy/put-role-policy/put-role-policy.handler.js";
import { makeSimAwsAccountRootPrincipal } from "../aws/caller/sim-aws-account-root-principal.js";
import { SimIamCredentialRegistry } from "./credential/sim-iam-credential-registry.js";
import type {
  SimAwsCredentials,
  SimIamCredentialIdentity,
} from "./credential/sim-aws-credentials.js";
import {
  SimIamRandomSessionCredentialGenerator,
  type SimIamSessionCredentialGenerator,
} from "./credential/session/sim-iam-session-cred-gen.js";
import { SimIamSessionManager } from "./credential/session/sim-iam-session-manager.js";
import {
  SimIamRandomUserCredentialGenerator,
  type SimIamUserCredentialGenerator,
} from "./credential/user/sim-iam-user-credential-generator.js";
import type { SimIamUser, SimIamUsername } from "./user/sim-iam-user.js";
import type {
  SimCreateUserCommand,
  SimCreateUserCommandOutput,
} from "./command/user/create-user/create-user.cmd.js";
import { CreateUserCommandHandler } from "./command/user/create-user/create-user.handler.js";
import type {
  SimCreateAccessKeyCommand,
  SimCreateAccessKeyCommandOutput,
} from "./command/user/create-access-key/create-access-key.cmd.js";
import { CreateAccessKeyCommandHandler } from "./command/user/create-access-key/create-access-key.handler.js";
import type { SimIamInterServiceAuthZ } from "./authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimPutUserPolicyCommand,
  SimPutUserPolicyCommandOutput,
} from "./command/policy/put-user-policy/put-user-policy.cmd.js";
import { PutUserPolicyCommandHandler } from "./command/policy/put-user-policy/put-user-policy.handler.js";

interface SimIamProps {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background?: BackgroundScheduler;
  readonly credentialRegistry?: SimIamCredentialRegistry;
  readonly sessionCredentialGenerator?: SimIamSessionCredentialGenerator;
  readonly userCredentialGenerator?: SimIamUserCredentialGenerator;
}

/**
 * Simulated IAM service facade. Handles SDK commands. Emulates AWS behaviour
 * and state.
 *
 * IAM is account-scoped in AWS. Yulin constructs it from an Account/Region
 * scope for consistency with the other service factories, but memoises one
 * service facade per Account.
 */
export class SimIam implements SimIamInterServiceAuthZ {
  /**
   * Manage temporary sessions belonging to this simulated IAM Account.
   */
  public readonly sessionManager: SimIamSessionManager;

  private readonly policies = new Map<SimArn, SimIamManagedPolicy>();
  private readonly roles = new Map<SimIamRoleName, SimIamRole>();
  private readonly users = new Map<SimIamUsername, SimIamUser>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;
  private readonly credentialRegistry: SimIamCredentialRegistry;
  private readonly userCredentialGenerator: SimIamUserCredentialGenerator;

  constructor(props: SimIamProps = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      credentialRegistry = new SimIamCredentialRegistry(),
      sessionCredentialGenerator = new SimIamRandomSessionCredentialGenerator(),
      userCredentialGenerator = new SimIamRandomUserCredentialGenerator(),
    } = props;

    this.accountRegionScope = accountRegionScope;
    this.background = background;
    this.credentialRegistry = credentialRegistry;
    this.userCredentialGenerator = userCredentialGenerator;
    this.sessionManager = new SimIamSessionManager({
      accountId: accountRegionScope.accountId,
      roles: this.roles,
      credentialRegistry,
      credentialGenerator: sessionCredentialGenerator,
    });
  }

  /**
   * Authenticate simulated AWS credentials.
   */
  resolveCredentials(
    credentials: SimAwsCredentials,
    now?: Date,
  ): SimIamCredentialIdentity {
    return this.credentialRegistry.resolve(credentials, now);
  }

  /**
   * Evaluate an IAM authorization attempt against policies relevant to the
   * request caller.
   *
   * If the caller is omitted, authorization defaults to the root principal of
   * the sim Account owning this sim IAM instance. An explicit anonymous caller
   * suppresses that fallback and is evaluated without identity policies.
   */
  authorize(input: SimIamAuthorizationInput): SimIamPolicyDecision {
    const simIamAuthorizer = new SimIamAuthorizer({
      policies: this.policies,
      roles: this.roles,
      users: this.users,
      defaultCallerPrincipal: makeSimAwsAccountRootPrincipal(
        this.accountRegionScope.accountId,
      ),
      credentialIdentityResolver: this,
    });
    return simIamAuthorizer.authorize(input);
  }

  /**
   * Handle a Create Policy Command from the SDK.
   */
  async createPolicy(
    cmd: SimCreatePolicyCommand,
  ): Promise<SimCreatePolicyCommandOutput> {
    const handler = new CreatePolicyCommandHandler({
      accountId: this.accountRegionScope.accountId,
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Get Policy Command from the SDK.
   */
  async getPolicy(
    cmd: SimGetPolicyCommand,
  ): Promise<SimGetPolicyCommandOutput> {
    const handler = new GetPolicyCommandHandler({
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a List Policies Command from the SDK.
   */
  async listPolicies(
    cmd: SimListPoliciesCommand,
  ): Promise<SimListPoliciesCommandOutput> {
    const handler = new ListPoliciesCommandHandler({
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Put Role Policy Command from the SDK.
   */
  async putRolePolicy(
    cmd: SimPutRolePolicyCommand,
  ): Promise<SimPutRolePolicyCommandOutput> {
    const handler = new PutRolePolicyCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle an IAM PutUserPolicy command.
   */
  async putUserPolicy(
    cmd: SimPutUserPolicyCommand,
  ): Promise<SimPutUserPolicyCommandOutput> {
    const handler = new PutUserPolicyCommandHandler({
      users: this.users,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Create Role Command from the SDK.
   */
  async createRole(
    cmd: SimCreateRoleCommand,
  ): Promise<SimCreateRoleCommandOutput> {
    const handler = new CreateRoleCommandHandler({
      accountId: this.accountRegionScope.accountId,
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Get Role Command from the SDK.
   */
  async getRole(cmd: SimGetRoleCommand): Promise<SimGetRoleCommandOutput> {
    const handler = new GetRoleCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a List Roles Command from the SDK.
   */
  async listRoles(
    cmd: SimListRolesCommand,
  ): Promise<SimListRolesCommandOutput> {
    const handler = new ListRolesCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle an IAM CreateUser command.
   */
  async createUser(
    cmd: SimCreateUserCommand,
  ): Promise<SimCreateUserCommandOutput> {
    const handler = new CreateUserCommandHandler({
      accountId: this.accountRegionScope.accountId,
      users: this.users,
      background: this.background,
    });

    return await handler.handle(cmd);
  }

  /**
   * Handle an IAM CreateAccessKey command.
   */
  async createAccessKey(
    cmd: SimCreateAccessKeyCommand,
  ): Promise<SimCreateAccessKeyCommandOutput> {
    const handler = new CreateAccessKeyCommandHandler({
      users: this.users,
      credentialRegistry: this.credentialRegistry,
      credentialGenerator: this.userCredentialGenerator,
      background: this.background,
    });

    return await handler.handle(cmd);
  }
}

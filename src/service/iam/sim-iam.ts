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
import type {
  SimGetRoleCommand,
  SimGetRoleCommandOutput,
} from "./command/role/get-role/get-role.cmd.js";
import type { SimIamRole, SimIamRoleName } from "./role/sim-iam-role.js";
import type {
  SimListRolesCommand,
  SimListRolesCommandOutput,
} from "./command/role/list-roles/list-roles.cmd.js";
import { SimIamRoleCommandHandlers } from "./command/role/sim-iam-role-command-handlers.js";
import type { SimIamAuthorizationInput } from "./authorize/context/sim-iam-auth-z-context-builder.js";
import type { SimIamPolicyDecision } from "./authorize/sim-iam-decision.js";
import { SimIamAuthorizer } from "./authorize/sim-iam-authorizer.js";
import type {
  SimPutRolePolicyCommand,
  SimPutRolePolicyCommandOutput,
} from "./command/policy/put-role-policy/put-role-policy.cmd.js";
import type {
  SimAttachRolePolicyCommand,
  SimAttachRolePolicyCommandOutput,
} from "./command/role/attach-role-policy/attach-role-policy.cmd.js";
import { makeSimAwsAccountRootPrincipal } from "../aws/caller/sim-aws-account-root-principal.js";
import { SimIamCredentialRegistry } from "./credential/sim-iam-credential-registry.js";
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
import type {
  SimPutUserPolicyCommand,
  SimPutUserPolicyCommandOutput,
} from "./command/policy/put-user-policy/put-user-policy.cmd.js";
import { PutUserPolicyCommandHandler } from "./command/policy/put-user-policy/put-user-policy.handler.js";
import { SimIamCloudFormationResourceFactory } from "./cfn/sim-cfn-iam-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimIamInterServiceAuthZ } from "./authorize/sim-iam-inter-service-auth-z.js";

interface SimIamProperties {
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

  public readonly credentials: SimIamCredentialRegistry;

  public readonly policies = new Map<SimArn, SimIamManagedPolicy>();
  public readonly roles = new Map<SimIamRoleName, SimIamRole>();
  private readonly users = new Map<SimIamUsername, SimIamUser>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;
  private readonly userCredentialGenerator: SimIamUserCredentialGenerator;
  private readonly cfnFactory: SimCfnServiceResourceFactory;
  private readonly roleCommands: SimIamRoleCommandHandlers;

  constructor(properties: SimIamProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      credentialRegistry = new SimIamCredentialRegistry(),
      sessionCredentialGenerator = new SimIamRandomSessionCredentialGenerator(),
      userCredentialGenerator = new SimIamRandomUserCredentialGenerator(),
    } = properties;

    this.accountRegionScope = accountRegionScope;
    this.background = background;
    this.credentials = credentialRegistry;
    this.userCredentialGenerator = userCredentialGenerator;
    this.sessionManager = new SimIamSessionManager({
      accountId: accountRegionScope.accountId,
      roles: this.roles,
      credentialRegistry,
      credentialGenerator: sessionCredentialGenerator,
    });
    this.cfnFactory = new SimIamCloudFormationResourceFactory(this);
    this.roleCommands = new SimIamRoleCommandHandlers({
      accountId: accountRegionScope.accountId,
      roles: this.roles,
      background: this.background,
    });
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
      credentialIdentityResolver: this.credentials,
    });
    return simIamAuthorizer.authorize(input);
  }

  /**
   * Handle a Create Policy Command from the SDK.
   */
  async createPolicy(
    command: SimCreatePolicyCommand,
  ): Promise<SimCreatePolicyCommandOutput> {
    const handler = new CreatePolicyCommandHandler({
      accountId: this.accountRegionScope.accountId,
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a Get Policy Command from the SDK.
   */
  async getPolicy(
    command: SimGetPolicyCommand,
  ): Promise<SimGetPolicyCommandOutput> {
    const handler = new GetPolicyCommandHandler({
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a List Policies Command from the SDK.
   */
  async listPolicies(
    command: SimListPoliciesCommand,
  ): Promise<SimListPoliciesCommandOutput> {
    const handler = new ListPoliciesCommandHandler({
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a Put Role Policy Command from the SDK.
   */
  async putRolePolicy(
    command: SimPutRolePolicyCommand,
  ): Promise<SimPutRolePolicyCommandOutput> {
    return await this.roleCommands.putRolePolicy(command);
  }

  /**
   * Handle an IAM PutUserPolicy command.
   */
  async putUserPolicy(
    command: SimPutUserPolicyCommand,
  ): Promise<SimPutUserPolicyCommandOutput> {
    const handler = new PutUserPolicyCommandHandler({
      users: this.users,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a Create Role Command from the SDK.
   */
  async createRole(
    command: SimCreateRoleCommand,
  ): Promise<SimCreateRoleCommandOutput> {
    return await this.roleCommands.createRole(command);
  }

  /**
   * Handle an Attach Role Policy Command from the SDK.
   */
  async attachRolePolicy(
    command: SimAttachRolePolicyCommand,
  ): Promise<SimAttachRolePolicyCommandOutput> {
    return await this.roleCommands.attachRolePolicy(command);
  }

  /**
   * Handle a Get Role Command from the SDK.
   */
  async getRole(command: SimGetRoleCommand): Promise<SimGetRoleCommandOutput> {
    return await this.roleCommands.getRole(command);
  }

  /**
   * Handle a List Roles Command from the SDK.
   */
  async listRoles(
    command: SimListRolesCommand,
  ): Promise<SimListRolesCommandOutput> {
    return await this.roleCommands.listRoles(command);
  }

  /**
   * Handle an IAM CreateUser command.
   */
  async createUser(
    command: SimCreateUserCommand,
  ): Promise<SimCreateUserCommandOutput> {
    const handler = new CreateUserCommandHandler({
      accountId: this.accountRegionScope.accountId,
      users: this.users,
      background: this.background,
    });

    return await handler.handle(command);
  }

  /**
   * Handle an IAM CreateAccessKey command.
   */
  async createAccessKey(
    command: SimCreateAccessKeyCommand,
  ): Promise<SimCreateAccessKeyCommandOutput> {
    const handler = new CreateAccessKeyCommandHandler({
      users: this.users,
      credentialRegistry: this.credentials,
      credentialGenerator: this.userCredentialGenerator,
      background: this.background,
    });

    return await handler.handle(command);
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return this.cfnFactory;
  }
}

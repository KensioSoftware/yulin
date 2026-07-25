import type { SimArn } from "../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type {
  SimCreatePolicyCommand,
  SimCreatePolicyCommandOutput,
} from "./command/policy/create-policy/create-policy.command.js";
import type { SimIamManagedPolicy } from "./policy/sim-iam-policy.js";
import type {
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput,
} from "./command/policy/get-policy/get-policy.command.js";
import type {
  SimListPoliciesCommand,
  SimListPoliciesCommandOutput,
} from "./command/policy/list-policies/list-policies.command.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type {
  SimCreateRoleCommand,
  SimCreateRoleCommandOutput,
} from "./command/role/create-role/create-role.command.js";
import type {
  SimGetRoleCommand,
  SimGetRoleCommandOutput,
} from "./command/role/get-role/get-role.command.js";
import type { SimIamRole, SimIamRoleName } from "./role/sim-iam-role.js";
import type {
  SimListRolesCommand,
  SimListRolesCommandOutput,
} from "./command/role/list-roles/list-roles.command.js";
import { SimIamRoleCommandHandlers } from "./command/role/sim-iam-role-command-handlers.js";
import type { SimIamAuthorizationInput } from "./authorize/context/sim-iam-auth-z-context-builder.js";
import type { SimIamPolicyDecision } from "./authorize/sim-iam-decision.js";
import type {
  SimPutRolePolicyCommand,
  SimPutRolePolicyCommandOutput,
} from "./command/policy/put-role-policy/put-role-policy.command.js";
import type {
  SimAttachRolePolicyCommand,
  SimAttachRolePolicyCommandOutput,
} from "./command/role/attach-role-policy/attach-role-policy.command.js";
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
} from "./command/user/create-user/create-user.command.js";
import type {
  SimCreateAccessKeyCommand,
  SimCreateAccessKeyCommandOutput,
} from "./command/user/create-access-key/create-access-key.command.js";
import { SimIamUserCommandHandlers } from "./command/user/sim-iam-user-command-handlers.js";
import { SimIamPolicyCommandHandlers } from "./command/policy/sim-iam-policy-command-handlers.js";
import { SimIamActionAuthorizer } from "./authorize/sim-iam-action-authorizer.js";
import { SimIamAccountAuthZ } from "./authorize/sim-iam-account-auth-z.js";
import type { SimIamRequestOptions } from "./command/sim-iam-request-options.js";
import type {
  SimPutUserPolicyCommand,
  SimPutUserPolicyCommandOutput,
} from "./command/policy/put-user-policy/put-user-policy.command.js";
import { SimIamCloudFormationResourceFactory } from "./cfn/sim-cfn-iam-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimIamInterServiceAuthZ } from "./authorize/sim-iam-inter-service-auth-z.js";
import { SimIamSdkCommandRouter } from "./sdk/sim-iam-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/index.js";

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

  private readonly background: BackgroundScheduler;
  private readonly cfnFactory: SimCfnServiceResourceFactory;
  private readonly roleCommands: SimIamRoleCommandHandlers;
  private readonly userCommands: SimIamUserCommandHandlers;
  private readonly policyCommands: SimIamPolicyCommandHandlers;
  private readonly accountAuthZ: SimIamAccountAuthZ;
  private readonly sdkRouter = new SimIamSdkCommandRouter(this);

  constructor(properties: SimIamProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      credentialRegistry = new SimIamCredentialRegistry(),
      sessionCredentialGenerator = new SimIamRandomSessionCredentialGenerator(),
      userCredentialGenerator = new SimIamRandomUserCredentialGenerator(),
    } = properties;

    this.background = background;
    this.credentials = credentialRegistry;
    this.sessionManager = new SimIamSessionManager({
      accountId: accountRegionScope.accountId,
      roles: this.roles,
      credentialRegistry,
      credentialGenerator: sessionCredentialGenerator,
    });
    this.cfnFactory = new SimIamCloudFormationResourceFactory(this);
    this.accountAuthZ = new SimIamAccountAuthZ({
      accountId: accountRegionScope.accountId,
      policies: this.policies,
      roles: this.roles,
      users: this.users,
      credentialIdentityResolver: credentialRegistry,
    });
    const authorizer = new SimIamActionAuthorizer({ iam: this });
    this.roleCommands = new SimIamRoleCommandHandlers({
      accountId: accountRegionScope.accountId,
      roles: this.roles,
      background: this.background,
      authorizer,
    });
    this.userCommands = new SimIamUserCommandHandlers({
      accountId: accountRegionScope.accountId,
      users: this.users,
      credentialRegistry,
      credentialGenerator: userCredentialGenerator,
      background: this.background,
      authorizer,
    });
    this.policyCommands = new SimIamPolicyCommandHandlers({
      accountId: accountRegionScope.accountId,
      policies: this.policies,
      users: this.users,
      background: this.background,
      authorizer,
    });
  }

  /**
   * Evaluate an IAM authorization attempt against policies relevant to the
   * request caller. An omitted caller defaults to the Account root principal.
   */
  authorize(input: SimIamAuthorizationInput): SimIamPolicyDecision {
    return this.accountAuthZ.authorize(input);
  }

  /**
   * Handle a Create Policy Command from the SDK.
   */
  async createPolicy(
    command: SimCreatePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreatePolicyCommandOutput> {
    return await this.policyCommands.createPolicy(command, options);
  }

  /**
   * Handle a Get Policy Command from the SDK.
   */
  async getPolicy(
    command: SimGetPolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimGetPolicyCommandOutput> {
    return await this.policyCommands.getPolicy(command, options);
  }

  /**
   * Handle a List Policies Command from the SDK.
   */
  async listPolicies(
    command: SimListPoliciesCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListPoliciesCommandOutput> {
    return await this.policyCommands.listPolicies(command, options);
  }

  /**
   * Handle a Put Role Policy Command from the SDK.
   */
  async putRolePolicy(
    command: SimPutRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimPutRolePolicyCommandOutput> {
    return await this.roleCommands.putRolePolicy(command, options);
  }

  /**
   * Handle an IAM PutUserPolicy command.
   */
  async putUserPolicy(
    command: SimPutUserPolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimPutUserPolicyCommandOutput> {
    return await this.policyCommands.putUserPolicy(command, options);
  }

  /**
   * Handle a Create Role Command from the SDK.
   */
  async createRole(
    command: SimCreateRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateRoleCommandOutput> {
    return await this.roleCommands.createRole(command, options);
  }

  /**
   * Handle an Attach Role Policy Command from the SDK.
   */
  async attachRolePolicy(
    command: SimAttachRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimAttachRolePolicyCommandOutput> {
    return await this.roleCommands.attachRolePolicy(command, options);
  }

  /**
   * Handle a Get Role Command from the SDK.
   */
  async getRole(
    command: SimGetRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimGetRoleCommandOutput> {
    return await this.roleCommands.getRole(command, options);
  }

  /**
   * Handle a List Roles Command from the SDK.
   */
  async listRoles(
    command: SimListRolesCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListRolesCommandOutput> {
    return await this.roleCommands.listRoles(command, options);
  }

  /**
   * Handle an IAM CreateUser command.
   */
  async createUser(
    command: SimCreateUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateUserCommandOutput> {
    return await this.userCommands.createUser(command, options);
  }

  /**
   * Handle an IAM CreateAccessKey command.
   */
  async createAccessKey(
    command: SimCreateAccessKeyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateAccessKeyCommandOutput> {
    return await this.userCommands.createAccessKey(command, options);
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return this.cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}

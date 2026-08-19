import type { SimArn } from "../aws/arn.js";
import type { SimAwsAccountId } from "../aws/sim-aws-account.js";
import type { SimIamManagedPolicy } from "./policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "./role/sim-iam-role.js";
import type { SimIamUser, SimIamUsername } from "./user/sim-iam-user.js";
import type { SimIamAuthorizationInput } from "./authorize/context/sim-iam-auth-z-context-builder.js";
import type { SimIamPolicyDecision } from "./authorize/sim-iam-decision.js";
import type * as simIamCommands from "./command/sim-iam-command.types.js";
import type { SimIamRequestOptions } from "./command/sim-iam-request-options.js";
import { SimIamCloudFormationResourceFactory } from "./cfn/sim-cfn-iam-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimIamInterServiceAuthZ } from "./authorize/sim-iam-inter-service-auth-z.js";
import type { SimIamAccountIdentityPolicies } from "./authorize/identity/sim-iam-account-identity-policies.js";
import type { SimIamAuthZPolicySource } from "./authorize/context/sim-iam-auth-z-context.js";
import type { SimAwsPrincipal } from "../aws/caller/sim-aws-caller.js";
import { SimIamSdkCommandRouter } from "./sdk/sim-iam-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/index.js";
import type { SimIamCredentialRegistry } from "./credential/sim-iam-credential-registry.js";
import type { SimIamSessionManager } from "./credential/session/sim-iam-session-manager.js";
import type { SimIamAccountAuthZ } from "./authorize/sim-iam-account-auth-z.js";
import type { SimIamCommandHandlers } from "./command/sim-iam-command-handlers.js";
import {
  SimIamAccountParts,
  type SimIamProperties,
} from "./sim-iam-account-parts.js";

/**
 * Simulated IAM service facade. Handles SDK commands. Emulates AWS behaviour
 * and state.
 *
 * IAM is account-scoped in AWS. Yulin constructs it from an Account/Region
 * scope for consistency with the other service factories, but memoises one
 * service facade per Account.
 */
export class SimIam
  implements SimIamInterServiceAuthZ, SimIamAccountIdentityPolicies
{
  /**
   * The simulated AWS Account this IAM belongs to.
   *
   * A standalone SimIam generates one, so this is how a test naming its own
   * principals finds out which Account they should belong to.
   */
  public readonly accountId: SimAwsAccountId;

  /**
   * Manage temporary sessions belonging to this simulated IAM Account.
   */
  public readonly sessionManager: SimIamSessionManager;

  public readonly credentials: SimIamCredentialRegistry;

  public readonly policies: Map<SimArn, SimIamManagedPolicy>;
  public readonly roles: Map<SimIamRoleName, SimIamRole>;
  /**
   * The Users this Account holds, by name.
   *
   * Exposed for the simulated services that report on a principal rather than
   * authorize one, such as STS answering GetCallerIdentity with a User's own
   * id.
   * @internal
   */
  public readonly users: Map<SimIamUsername, SimIamUser>;

  private readonly cfnFactory: SimCfnServiceResourceFactory;
  private readonly commands: SimIamCommandHandlers;
  private readonly accountAuthZ: SimIamAccountAuthZ;
  private readonly sdkRouter = new SimIamSdkCommandRouter(this);

  constructor(properties: SimIamProperties = {}) {
    const parts = new SimIamAccountParts(properties);

    this.accountId = parts.accountId;
    this.policies = parts.policies;
    this.roles = parts.roles;
    this.users = parts.users;
    this.credentials = parts.credentials;
    this.sessionManager = parts.sessionManager;
    this.accountAuthZ = parts.accountAuthZ;
    this.commands = parts.commandHandlers(this);
    this.cfnFactory = new SimIamCloudFormationResourceFactory(this);
  }

  /**
   * Evaluate an IAM authorization attempt against policies relevant to the
   * request caller. An omitted caller defaults to the Account root principal.
   */
  authorize(input: SimIamAuthorizationInput): SimIamPolicyDecision {
    return this.accountAuthZ.authorize(input);
  }

  /**
   * Identity-based policies this Account applies to one of its own principals.
   *
   * This is how another Account's IAM asks this Account what it grants a
   * principal of its own, which is the caller's side of a cross-Account
   * request. Real AWS requires that side to allow the action as well as the
   * resource's own resource-based policy.
   * @internal
   */
  identityPolicySourcesFor(
    principal: SimAwsPrincipal,
  ): readonly SimIamAuthZPolicySource[] {
    return this.accountAuthZ.identityPolicySourcesFor(principal);
  }

  /**
   * Handle a Create Policy Command from the SDK.
   */
  async createPolicy(
    command: simIamCommands.SimCreatePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimCreatePolicyCommandOutput> {
    return await this.commands.policies.createPolicy(command, options);
  }

  /**
   * Handle a Get Policy Command from the SDK.
   */
  async getPolicy(
    command: simIamCommands.SimGetPolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimGetPolicyCommandOutput> {
    return await this.commands.policies.getPolicy(command, options);
  }

  /**
   * Handle a List Policies Command from the SDK.
   */
  async listPolicies(
    command: simIamCommands.SimListPoliciesCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimListPoliciesCommandOutput> {
    return await this.commands.policies.listPolicies(command, options);
  }

  /**
   * Handle a Put Role Policy Command from the SDK.
   */
  async putRolePolicy(
    command: simIamCommands.SimPutRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimPutRolePolicyCommandOutput> {
    return await this.commands.roles.putRolePolicy(command, options);
  }

  /**
   * Handle an IAM PutUserPolicy command.
   */
  async putUserPolicy(
    command: simIamCommands.SimPutUserPolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimPutUserPolicyCommandOutput> {
    return await this.commands.policies.putUserPolicy(command, options);
  }

  /**
   * Handle a Create Role Command from the SDK.
   */
  async createRole(
    command: simIamCommands.SimCreateRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimCreateRoleCommandOutput> {
    return await this.commands.roles.createRole(command, options);
  }

  /**
   * Handle an Attach Role Policy Command from the SDK.
   */
  async attachRolePolicy(
    command: simIamCommands.SimAttachRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimAttachRolePolicyCommandOutput> {
    return await this.commands.roles.attachRolePolicy(command, options);
  }

  /**
   * Handle a Detach Role Policy Command from the SDK.
   */
  async detachRolePolicy(
    command: simIamCommands.SimDetachRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimDetachRolePolicyCommandOutput> {
    return await this.commands.roles.detachRolePolicy(command, options);
  }

  /**
   * Handle a Delete Role Policy Command from the SDK.
   */
  async deleteRolePolicy(
    command: simIamCommands.SimDeleteRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimDeleteRolePolicyCommandOutput> {
    return await this.commands.roles.deleteRolePolicy(command, options);
  }

  /**
   * Handle a Delete Role Command from the SDK.
   */
  async deleteRole(
    command: simIamCommands.SimDeleteRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimDeleteRoleCommandOutput> {
    return await this.commands.roles.deleteRole(command, options);
  }

  /**
   * Handle a Delete Policy Command from the SDK.
   */
  async deletePolicy(
    command: simIamCommands.SimDeletePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimDeletePolicyCommandOutput> {
    return await this.commands.policies.deletePolicy(command, options);
  }

  /**
   * Handle a Get Role Command from the SDK.
   */
  async getRole(
    command: simIamCommands.SimGetRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimGetRoleCommandOutput> {
    return await this.commands.roles.getRole(command, options);
  }

  /**
   * Handle a List Roles Command from the SDK.
   */
  async listRoles(
    command: simIamCommands.SimListRolesCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimListRolesCommandOutput> {
    return await this.commands.roles.listRoles(command, options);
  }

  /**
   * Handle an IAM CreateUser command.
   */
  async createUser(
    command: simIamCommands.SimCreateUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimCreateUserCommandOutput> {
    return await this.commands.users.createUser(command, options);
  }

  /**
   * Handle an IAM DeleteUser command.
   */
  async deleteUser(
    command: simIamCommands.SimDeleteUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimDeleteUserCommandOutput> {
    return await this.commands.users.deleteUser(command, options);
  }

  /**
   * Handle an IAM AttachUserPolicy command.
   */
  async attachUserPolicy(
    command: simIamCommands.SimAttachUserPolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimAttachUserPolicyCommandOutput> {
    return await this.commands.users.attachUserPolicy(command, options);
  }

  /**
   * Handle an IAM CreateLoginProfile command.
   */
  async createLoginProfile(
    command: simIamCommands.SimCreateLoginProfileCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimCreateLoginProfileCommandOutput> {
    return await this.commands.users.createLoginProfile(command, options);
  }

  /**
   * Handle an IAM CreateAccessKey command.
   */
  async createAccessKey(
    command: simIamCommands.SimCreateAccessKeyCommand,
    options?: SimIamRequestOptions,
  ): Promise<simIamCommands.SimCreateAccessKeyCommandOutput> {
    return await this.commands.users.createAccessKey(command, options);
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

import type { SimArn } from "../aws/arn.js";
import type { SimAwsAccountId } from "../aws/sim-aws-account.js";
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
import type {
  SimCreateUserCommand,
  SimCreateUserCommandOutput,
} from "./command/user/create-user/create-user.command.js";
import type {
  SimCreateAccessKeyCommand,
  SimCreateAccessKeyCommandOutput,
} from "./command/user/create-access-key/create-access-key.command.js";
import type { SimIamRequestOptions } from "./command/sim-iam-request-options.js";
import type {
  SimPutUserPolicyCommand,
  SimPutUserPolicyCommandOutput,
} from "./command/policy/put-user-policy/put-user-policy.command.js";
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

  private readonly cfnFactory: SimCfnServiceResourceFactory;
  private readonly commands: SimIamCommandHandlers;
  private readonly accountAuthZ: SimIamAccountAuthZ;
  private readonly sdkRouter = new SimIamSdkCommandRouter(this);

  constructor(properties: SimIamProperties = {}) {
    const parts = new SimIamAccountParts(properties);

    this.accountId = parts.accountId;
    this.policies = parts.policies;
    this.roles = parts.roles;
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
    command: SimCreatePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreatePolicyCommandOutput> {
    return await this.commands.policies.createPolicy(command, options);
  }

  /**
   * Handle a Get Policy Command from the SDK.
   */
  async getPolicy(
    command: SimGetPolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimGetPolicyCommandOutput> {
    return await this.commands.policies.getPolicy(command, options);
  }

  /**
   * Handle a List Policies Command from the SDK.
   */
  async listPolicies(
    command: SimListPoliciesCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListPoliciesCommandOutput> {
    return await this.commands.policies.listPolicies(command, options);
  }

  /**
   * Handle a Put Role Policy Command from the SDK.
   */
  async putRolePolicy(
    command: SimPutRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimPutRolePolicyCommandOutput> {
    return await this.commands.roles.putRolePolicy(command, options);
  }

  /**
   * Handle an IAM PutUserPolicy command.
   */
  async putUserPolicy(
    command: SimPutUserPolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimPutUserPolicyCommandOutput> {
    return await this.commands.policies.putUserPolicy(command, options);
  }

  /**
   * Handle a Create Role Command from the SDK.
   */
  async createRole(
    command: SimCreateRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateRoleCommandOutput> {
    return await this.commands.roles.createRole(command, options);
  }

  /**
   * Handle an Attach Role Policy Command from the SDK.
   */
  async attachRolePolicy(
    command: SimAttachRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimAttachRolePolicyCommandOutput> {
    return await this.commands.roles.attachRolePolicy(command, options);
  }

  /**
   * Handle a Get Role Command from the SDK.
   */
  async getRole(
    command: SimGetRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimGetRoleCommandOutput> {
    return await this.commands.roles.getRole(command, options);
  }

  /**
   * Handle a List Roles Command from the SDK.
   */
  async listRoles(
    command: SimListRolesCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListRolesCommandOutput> {
    return await this.commands.roles.listRoles(command, options);
  }

  /**
   * Handle an IAM CreateUser command.
   */
  async createUser(
    command: SimCreateUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateUserCommandOutput> {
    return await this.commands.users.createUser(command, options);
  }

  /**
   * Handle an IAM CreateAccessKey command.
   */
  async createAccessKey(
    command: SimCreateAccessKeyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateAccessKeyCommandOutput> {
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

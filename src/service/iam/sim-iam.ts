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
import { SimIamRegistry } from "./registry/sim-iam-registry.js";
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

interface SimIamProps {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background?: BackgroundScheduler;
  readonly iamRegistry?: SimIamRegistry;
}

/**
 * Simulated IAM. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * IAM is account-scoped in AWS. Yulin constructs it from an Account/Region
 * scope for consistency with the other service factories, but memoises one
 * service facade per Account.
 */
export class SimIam {
  private readonly policies = new Map<SimArn, SimIamManagedPolicy>();
  private readonly roles = new Map<SimIamRoleName, SimIamRole>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;
  private readonly iamRegistry: SimIamRegistry;

  constructor(props: SimIamProps = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      iamRegistry = new SimIamRegistry(),
    } = props;

    this.accountRegionScope = accountRegionScope;
    this.background = background;
    this.iamRegistry = iamRegistry;
  }

  /**
   * Evaluate an IAM authorization attempt against policies relevant to the
   * requested principal.
   */
  authorize(input: SimIamAuthorizationInput): SimIamPolicyDecision {
    return new SimIamAuthorizer({
      policies: this.policies,
      roles: this.roles,
    }).authorize(input);
  }

  /**
   * Handle a Create Policy Command from the SDK.
   */
  async createPolicy(
    cmd: SimCreatePolicyCommand,
  ): Promise<SimCreatePolicyCommandOutput> {
    this.iamRegistry.activate("IAM SDK API", "CreatePolicy");

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
    this.iamRegistry.activate("IAM SDK API", "GetPolicy");

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
    this.iamRegistry.activate("IAM SDK API", "ListPolicies");

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
    this.iamRegistry.activate("IAM SDK API", "PutRolePolicy");

    const handler = new PutRolePolicyCommandHandler({
      roles: this.roles,
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
    this.iamRegistry.activate("IAM SDK API", "CreateRole");

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
    this.iamRegistry.activate("IAM SDK API", "GetRole");

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
    this.iamRegistry.activate("IAM SDK API", "ListRoles");

    const handler = new ListRolesCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(cmd);
  }
}

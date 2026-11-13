import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import { simIamPermissionsBoundaryCondition } from "../../role/sim-iam-role-boundary.js";
import { CreateRoleCommandHandler } from "./create-role/create-role.handler.js";
import type {
  SimCreateRoleCommand,
  SimCreateRoleCommandOutput,
} from "./create-role/create-role.command.js";
import { GetRoleCommandHandler } from "./get-role/get-role.handler.js";
import type {
  SimGetRoleCommand,
  SimGetRoleCommandOutput,
} from "./get-role/get-role.command.js";
import { ListRolesCommandHandler } from "./list-roles/list-roles.handler.js";
import type {
  SimListRolesCommand,
  SimListRolesCommandOutput,
} from "./list-roles/list-roles.command.js";
import { PutRolePolicyCommandHandler } from "../policy/put-role-policy/put-role-policy.handler.js";
import type {
  SimPutRolePolicyCommand,
  SimPutRolePolicyCommandOutput,
} from "../policy/put-role-policy/put-role-policy.command.js";
import { AttachRolePolicyCommandHandler } from "./attach-role-policy/attach-role-policy.handler.js";
import type {
  SimAttachRolePolicyCommand,
  SimAttachRolePolicyCommandOutput,
} from "./attach-role-policy/attach-role-policy.command.js";
import { DetachRolePolicyCommandHandler } from "./detach-role-policy/detach-role-policy.handler.js";
import type {
  SimDetachRolePolicyCommand,
  SimDetachRolePolicyCommandOutput,
} from "./detach-role-policy/detach-role-policy.command.js";
import { ListAttachedRolePoliciesCommandHandler } from "./list-attached-role-policies/list-attached-role-policies.handler.js";
import type {
  SimListAttachedRolePoliciesCommand,
  SimListAttachedRolePoliciesCommandOutput,
} from "./list-attached-role-policies/list-attached-role-policies.command.js";
import { DeleteRoleCommandHandler } from "./delete-role/delete-role.handler.js";
import type {
  SimDeleteRoleCommand,
  SimDeleteRoleCommandOutput,
} from "./delete-role/delete-role.command.js";
import { DeleteRolePolicyCommandHandler } from "../policy/delete-role-policy/delete-role-policy.handler.js";
import type {
  SimDeleteRolePolicyCommand,
  SimDeleteRolePolicyCommandOutput,
} from "../policy/delete-role-policy/delete-role-policy.command.js";
import { SimIamIdentityAuthorizer } from "../../tag/sim-iam-identity-authorizer.js";

interface SimIamRoleCommandHandlersProperties {
  readonly accountId: SimAwsAccountId;
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly background: BackgroundScheduler;
  readonly authorizer: SimIamActionAuthorizer;
}

/**
 * Wires and runs the SDK command handlers that operate on IAM Roles.
 *
 * Grouping the role command wiring here keeps the SimIam facade a thin
 * delegator while keeping all role-keyed command handlers in one cohesive
 * place. Inline (PutRolePolicy) and managed (AttachRolePolicy) policy
 * association both act on a Role, so they live here alongside role lifecycle
 * commands.
 */
export class SimIamRoleCommandHandlers {
  private readonly accountId: SimAwsAccountId;
  private readonly roles: Map<SimIamRoleName, SimIamRole>;
  private readonly background: BackgroundScheduler;
  private readonly authorizer: SimIamActionAuthorizer;
  private readonly identity: SimIamIdentityAuthorizer;

  constructor(properties: SimIamRoleCommandHandlersProperties) {
    const { accountId, roles, background, authorizer } = properties;

    this.accountId = accountId;
    this.roles = roles;
    this.background = background;
    this.authorizer = authorizer;
    this.identity = new SimIamIdentityAuthorizer({
      accountId,
      authorizer,
      entity: "Role",
      find: (name): SimIamRole | undefined => roles.get(name as SimIamRoleName),
    });
  }

  /**
   * Handle a CreateRole command from the SDK.
   */
  async createRole(
    command: SimCreateRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateRoleCommandOutput> {
    this.identity.authorizeCreate(
      command.input.RoleName,
      command.input.Tags,
      options,
      simIamPermissionsBoundaryCondition(command.input.PermissionsBoundary),
    );
    const handler = new CreateRoleCommandHandler({
      accountId: this.accountId,
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a GetRole command from the SDK.
   */
  async getRole(
    command: SimGetRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimGetRoleCommandOutput> {
    this.identity.authorize("iam:GetRole", command.input.RoleName, options);
    const handler = new GetRoleCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a ListRoles command from the SDK.
   */
  async listRoles(
    command: SimListRolesCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListRolesCommandOutput> {
    this.authorizer.authorize("iam:ListRoles", "*", options?.caller);
    const handler = new ListRolesCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a PutRolePolicy command from the SDK.
   */
  async putRolePolicy(
    command: SimPutRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimPutRolePolicyCommandOutput> {
    this.identity.authorize(
      "iam:PutRolePolicy",
      command.input.RoleName,
      options,
    );
    const handler = new PutRolePolicyCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle an AttachRolePolicy command from the SDK.
   */
  async attachRolePolicy(
    command: SimAttachRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimAttachRolePolicyCommandOutput> {
    this.identity.authorize(
      "iam:AttachRolePolicy",
      command.input.RoleName,
      options,
    );
    const handler = new AttachRolePolicyCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a DetachRolePolicy command from the SDK.
   */
  async detachRolePolicy(
    command: SimDetachRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimDetachRolePolicyCommandOutput> {
    this.identity.authorize(
      "iam:DetachRolePolicy",
      command.input.RoleName,
      options,
    );
    const handler = new DetachRolePolicyCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a ListAttachedRolePolicies command from the SDK.
   */
  async listAttachedRolePolicies(
    command: SimListAttachedRolePoliciesCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListAttachedRolePoliciesCommandOutput> {
    this.identity.authorize(
      "iam:ListAttachedRolePolicies",
      command.input.RoleName,
      options,
    );
    const handler = new ListAttachedRolePoliciesCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a DeleteRolePolicy command from the SDK.
   */
  async deleteRolePolicy(
    command: SimDeleteRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimDeleteRolePolicyCommandOutput> {
    this.identity.authorize(
      "iam:DeleteRolePolicy",
      command.input.RoleName,
      options,
    );
    const handler = new DeleteRolePolicyCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a DeleteRole command from the SDK.
   */
  async deleteRole(
    command: SimDeleteRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimDeleteRoleCommandOutput> {
    this.identity.authorize("iam:DeleteRole", command.input.RoleName, options);
    const handler = new DeleteRoleCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(command);
  }
}

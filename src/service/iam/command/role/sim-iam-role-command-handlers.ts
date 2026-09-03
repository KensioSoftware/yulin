import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import type { SimIamConditionValue } from "../../policy/sim-iam-policy.js";
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

  constructor(properties: SimIamRoleCommandHandlersProperties) {
    const { accountId, roles, background, authorizer } = properties;

    this.accountId = accountId;
    this.roles = roles;
    this.background = background;
    this.authorizer = authorizer;
  }

  /**
   * Handle a CreateRole command from the SDK.
   */
  async createRole(
    command: SimCreateRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateRoleCommandOutput> {
    this.authorizer.authorize(
      "iam:CreateRole",
      this.roleArn(command.input.RoleName),
      options?.caller,
      permissionsBoundaryCondition(command.input.PermissionsBoundary),
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
    this.authorizer.authorize(
      "iam:GetRole",
      this.roleArn(command.input.RoleName),
      options?.caller,
    );
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
    this.authorizer.authorize(
      "iam:PutRolePolicy",
      this.roleArn(command.input.RoleName),
      options?.caller,
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
    this.authorizer.authorize(
      "iam:AttachRolePolicy",
      this.roleArn(command.input.RoleName),
      options?.caller,
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
    this.authorizer.authorize(
      "iam:DetachRolePolicy",
      this.roleArn(command.input.RoleName),
      options?.caller,
    );
    const handler = new DetachRolePolicyCommandHandler({
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
    this.authorizer.authorize(
      "iam:DeleteRolePolicy",
      this.roleArn(command.input.RoleName),
      options?.caller,
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
    this.authorizer.authorize(
      "iam:DeleteRole",
      this.roleArn(command.input.RoleName),
      options?.caller,
    );
    const handler = new DeleteRoleCommandHandler({
      roles: this.roles,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * The Role ARN a command operates on, for authorization.
   */
  private roleArn(roleName: string | undefined): string {
    return `arn:aws:iam::${this.accountId}:role/${roleName ?? "*"}`;
  }
}

/**
 * What a Role-creating request says about the boundary it declares.
 *
 * An account that requires a permissions boundary allows `iam:CreateRole`
 * only under `StringEquals` on `iam:PermissionsBoundary`, and the CDK
 * permissions-boundary guard is written that way. A request declaring no
 * boundary leaves the key out, which is what refuses it: a positive operator
 * over an absent key matches nothing.
 */
function permissionsBoundaryCondition(
  permissionsBoundary: string | undefined,
): Readonly<Record<string, SimIamConditionValue>> | undefined {
  return permissionsBoundary === undefined
    ? undefined
    : { "iam:PermissionsBoundary": permissionsBoundary };
}

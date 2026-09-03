import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";

import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import type {
  SimGetRoleCommand,
  SimGetRoleCommandOutput,
} from "./get-role.command.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import { simIamAttachedPermissionsBoundary } from "../../../role/sim-iam-role-boundary.js";

interface GetRoleCommandHandlerProperties {
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM GetRoleCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/GetRoleCommand/
 */
export class GetRoleCommandHandler implements CommandHandler<
  SimGetRoleCommand,
  SimGetRoleCommandOutput
> {
  private readonly roles: Map<SimIamRoleName, SimIamRole>;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetRoleCommandHandlerProperties) {
    const { roles, background = new BackgroundTasks() } = properties;

    this.roles = roles;
    this.background = background;
  }

  /**
   * Handle a GetRoleCommand from the SDK.
   */
  async handle(command: SimGetRoleCommand): Promise<SimGetRoleCommandOutput> {
    const roleName = command.input.RoleName as SimIamRoleName | undefined;

    if (roleName === undefined || roleName.length === 0) {
      throw new Error("RoleName is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const role = this.roles.get(roleName);

    if (role === undefined) {
      throw new SimIamNoSuchEntity(`No IAM Role named ${roleName}`);
    }

    return {
      Role: {
        Path: role.path,
        RoleName: role.roleName,
        RoleId: role.roleId,
        Arn: role.arn,
        CreateDate: role.creationDate,
        AssumeRolePolicyDocument: role.assumeRolePolicyDocument,
        Description: role.description,
        PermissionsBoundary: simIamAttachedPermissionsBoundary(role),
      },
    };
  }
}

import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import type {
  SimListRolesCommand,
  SimListRolesCommandOutput,
} from "./list-roles.command.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import { ListRolesPaginator } from "./list-roles-paginator.js";

interface ListRolesCommandHandlerProperties {
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM ListRolesCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/ListRolesCommand/
 */
export class ListRolesCommandHandler implements CommandHandler<
  SimListRolesCommand,
  SimListRolesCommandOutput
> {
  private readonly roles: Map<SimIamRoleName, SimIamRole>;
  private readonly background: BackgroundScheduler;
  private readonly paginator = new ListRolesPaginator();

  constructor(properties: ListRolesCommandHandlerProperties) {
    const { roles, background = new BackgroundTasks() } = properties;

    this.roles = roles;
    this.background = background;
  }

  /**
   * Handle a ListRolesCommand from the SDK.
   */
  async handle(
    command: SimListRolesCommand,
  ): Promise<SimListRolesCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const roles = this.matchingRoles(command);
    const page = this.paginator.page(
      roles,
      command.input.MaxItems,
      command.input.Marker,
    );

    return {
      Roles: page.roles.map((role) => ({
        Path: role.path,
        RoleName: role.roleName,
        RoleId: role.roleId,
        Arn: role.arn,
        CreateDate: role.createDate,
        AssumeRolePolicyDocument: role.assumeRolePolicyDocument,
        Description: role.description,
      })),
      IsTruncated: page.isTruncated,
      Marker: page.marker,
    };
  }

  private matchingRoles(command: SimListRolesCommand): SimIamRole[] {
    const roles = this.roles
      .values()
      .toArray()
      .toSorted((a, b) => a.arn.localeCompare(b.arn));

    return roles.filter((role) => {
      return !(
        command.input.PathPrefix !== undefined &&
        !role.path.startsWith(command.input.PathPrefix)
      );
    });
  }
}

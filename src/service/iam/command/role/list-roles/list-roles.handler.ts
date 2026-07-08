import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import type {
  SimListRolesCommand,
  SimListRolesCommandOutput,
} from "./list-roles.cmd.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";

interface ListRolesCommandHandlerProps {
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

  constructor(props: ListRolesCommandHandlerProps) {
    const { roles, background = new BackgroundTasks() } = props;

    this.roles = roles;
    this.background = background;
  }

  /**
   * Handle a ListRolesCommand from the SDK.
   */
  async handle(cmd: SimListRolesCommand): Promise<SimListRolesCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const maxItems = cmd.input.MaxItems ?? 100;
    const roles = this.matchingRoles(cmd);

    const startRoleName =
      cmd.input.Marker === undefined
        ? undefined
        : ListRolesCommandHandler.parseMarker(cmd.input.Marker);

    const startIndex =
      startRoleName === undefined
        ? 0
        : Math.max(
            0,
            roles.findIndex((role) => role.roleName === startRoleName) + 1,
          );

    const page = roles.slice(startIndex, startIndex + maxItems);
    const lastRole = page.at(-1);
    const isTruncated = startIndex + page.length < roles.length;

    return {
      Roles: page.map((role) => ({
        Path: role.path,
        RoleName: role.roleName,
        RoleId: role.roleId,
        Arn: role.arn,
        CreateDate: role.createDate,
        AssumeRolePolicyDocument: role.assumeRolePolicyDocument,
        Description: role.description,
      })),
      IsTruncated: isTruncated,
      Marker:
        isTruncated && lastRole !== undefined
          ? ListRolesCommandHandler.makeMarker(lastRole.roleName)
          : undefined,
    };
  }

  private matchingRoles(cmd: SimListRolesCommand): SimIamRole[] {
    const roles = [...this.roles.values()].toSorted((a, b) =>
      a.arn.localeCompare(b.arn),
    );

    return roles.filter((role) => {
      if (
        cmd.input.PathPrefix !== undefined &&
        !role.path.startsWith(cmd.input.PathPrefix)
      ) {
        return false;
      }

      return true;
    });
  }

  private static makeMarker(roleName: SimIamRoleName): string {
    return Buffer.from(roleName, "utf8").toString("base64url");
  }

  private static parseMarker(marker: string): SimIamRoleName {
    return Buffer.from(marker, "base64url").toString("utf8") as SimIamRoleName;
  }
}

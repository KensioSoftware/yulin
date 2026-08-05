import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import {
  SimIamDeleteConflict,
  SimIamNoSuchEntity,
} from "../../../error/sim-iam.error.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import type {
  SimDeleteRoleCommand,
  SimDeleteRoleCommandOutput,
} from "./delete-role.command.js";

interface DeleteRoleCommandHandlerProperties {
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM DeleteRoleCommand handler.
 *
 * Real IAM only deletes a Role nothing is hanging off. A Role with inline
 * policies or attached managed policies is refused, leaving the caller to
 * remove them first with DeleteRolePolicy and DetachRolePolicy. That refusal
 * is why a CloudFormation Stack deletes a Role's policies before the Role.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/DeleteRoleCommand/
 */
export class DeleteRoleCommandHandler implements CommandHandler<
  SimDeleteRoleCommand,
  SimDeleteRoleCommandOutput
> {
  private readonly roles: Map<SimIamRoleName, SimIamRole>;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteRoleCommandHandlerProperties) {
    const { roles, background = new BackgroundTasks() } = properties;

    this.roles = roles;
    this.background = background;
  }

  /**
   * Handle a DeleteRoleCommand from the SDK.
   */
  async handle(
    command: SimDeleteRoleCommand,
  ): Promise<SimDeleteRoleCommandOutput> {
    const roleName = command.input.RoleName as SimIamRoleName | undefined;

    if (roleName === undefined || roleName.length === 0) {
      throw new Error("RoleName is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const role = this.roles.get(roleName);

    if (role === undefined) {
      throw new SimIamNoSuchEntity(`No IAM Role with name ${roleName}`);
    }

    this.assertNothingAttached(role);
    this.roles.delete(roleName);

    return {};
  }

  private assertNothingAttached(role: SimIamRole): void {
    const attached = role.inlinePolicies.size + role.attachedPolicyArns.size;

    if (attached > 0) {
      throw new SimIamDeleteConflict(
        `Cannot delete entity, must detach all policies first: ` +
          `IAM Role ${role.roleName}`,
      );
    }
  }
}

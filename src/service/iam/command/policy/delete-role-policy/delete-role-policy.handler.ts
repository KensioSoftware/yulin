import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import type {
  SimDeleteRolePolicyCommand,
  SimDeleteRolePolicyCommandOutput,
} from "./delete-role-policy.command.js";

interface DeleteRolePolicyCommandHandlerProperties {
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM DeleteRolePolicyCommand handler.
 *
 * This removes an inline policy stored on the Role, which is what
 * PutRolePolicy put there. A policy name the Role does not carry is refused,
 * as real IAM has nothing to remove.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/DeleteRolePolicyCommand/
 */
export class DeleteRolePolicyCommandHandler implements CommandHandler<
  SimDeleteRolePolicyCommand,
  SimDeleteRolePolicyCommandOutput
> {
  private readonly roles: Map<SimIamRoleName, SimIamRole>;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteRolePolicyCommandHandlerProperties) {
    const { roles, background = new BackgroundTasks() } = properties;

    this.roles = roles;
    this.background = background;
  }

  /**
   * Handle a DeleteRolePolicyCommand from the SDK.
   */
  async handle(
    command: SimDeleteRolePolicyCommand,
  ): Promise<SimDeleteRolePolicyCommandOutput> {
    const roleName = command.input.RoleName as SimIamRoleName | undefined;

    if (roleName === undefined || roleName.length === 0) {
      throw new Error("RoleName is required");
    }

    const { PolicyName: policyName } = command.input;

    if (policyName === undefined || policyName.length === 0) {
      throw new Error("PolicyName is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const role = this.roles.get(roleName);

    if (role === undefined) {
      throw new SimIamNoSuchEntity(`No IAM Role with name ${roleName}`);
    }

    if (!role.inlinePolicies.delete(policyName)) {
      throw new SimIamNoSuchEntity(
        `No inline IAM Policy named ${policyName} on Role ${roleName}`,
      );
    }

    return {};
  }
}

import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import type { SimArn } from "../../../../aws/arn.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import type {
  SimDetachRolePolicyCommand,
  SimDetachRolePolicyCommandOutput,
} from "./detach-role-policy.command.js";

interface DetachRolePolicyCommandHandlerProperties {
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM DetachRolePolicyCommand handler.
 *
 * Detaching removes the attachment record rather than the managed policy
 * itself, which is the other half of what AttachRolePolicy records. A policy
 * that is not attached is refused, as real IAM has nothing to detach.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/DetachRolePolicyCommand/
 */
export class DetachRolePolicyCommandHandler implements CommandHandler<
  SimDetachRolePolicyCommand,
  SimDetachRolePolicyCommandOutput
> {
  private readonly roles: Map<SimIamRoleName, SimIamRole>;
  private readonly background: BackgroundScheduler;

  constructor(properties: DetachRolePolicyCommandHandlerProperties) {
    const { roles, background = new BackgroundTasks() } = properties;

    this.roles = roles;
    this.background = background;
  }

  /**
   * Handle a DetachRolePolicyCommand from the SDK.
   */
  async handle(
    command: SimDetachRolePolicyCommand,
  ): Promise<SimDetachRolePolicyCommandOutput> {
    const roleName = command.input.RoleName as SimIamRoleName | undefined;

    if (roleName === undefined || roleName.length === 0) {
      throw new Error("RoleName is required");
    }

    const policyArn = command.input.PolicyArn as SimArn | undefined;

    if (policyArn === undefined || policyArn.length === 0) {
      throw new Error("PolicyArn is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const role = this.roles.get(roleName);

    if (role === undefined) {
      throw new SimIamNoSuchEntity(`No IAM Role with name ${roleName}`);
    }

    if (!role.attachedPolicyArns.delete(policyArn)) {
      throw new SimIamNoSuchEntity(
        `IAM Policy ${policyArn} is not attached to Role ${roleName}`,
      );
    }

    return {};
  }
}

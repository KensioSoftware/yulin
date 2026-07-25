import type { CommandHandler } from "../../../../../command/command-handler.js";
import type { SimArn } from "../../../../aws/arn.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import type {
  SimAttachRolePolicyCommand,
  SimAttachRolePolicyCommandOutput,
} from "./attach-role-policy.command.js";

interface AttachRolePolicyCommandHandlerProperties {
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM AttachRolePolicyCommand handler.
 *
 * AttachRolePolicy records that a managed policy is attached to a role by ARN.
 * The attachment refers to the managed policy rather than copying its document,
 * so authorization resolves the referenced policy from the account policy store
 * at evaluation time.
 *
 * Attachment state is stored independently of policy storage. Attaching an ARN
 * that has no stored managed policy (for example an AWS-managed policy ARN) is
 * allowed and simply contributes no statements to authorization decisions.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/AttachRolePolicyCommand/
 */
export class AttachRolePolicyCommandHandler implements CommandHandler<
  SimAttachRolePolicyCommand,
  SimAttachRolePolicyCommandOutput
> {
  private readonly roles: Map<SimIamRoleName, SimIamRole>;
  private readonly background: BackgroundScheduler;

  constructor(properties: AttachRolePolicyCommandHandlerProperties) {
    const { roles, background = new BackgroundTasks() } = properties;

    this.roles = roles;
    this.background = background;
  }

  /**
   * Handle an AttachRolePolicyCommand from the SDK.
   */
  async handle(
    command: SimAttachRolePolicyCommand,
  ): Promise<SimAttachRolePolicyCommandOutput> {
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

    role.attachedPolicyArns.add(policyArn);

    return {};
  }
}

import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import type { SimArn } from "../../../../aws/arn.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";
import type {
  SimAttachUserPolicyCommand,
  SimAttachUserPolicyCommandOutput,
} from "./attach-user-policy.command.js";

interface AttachUserPolicyCommandHandlerProperties {
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM AttachUserPolicyCommand handler.
 *
 * The user-side counterpart of AttachRolePolicy: the attachment records a
 * managed policy ARN on the user, and authorization resolves the referenced
 * policy from the account policy store when it evaluates a request. An ARN
 * with no stored policy behind it, such as an AWS-managed one, attaches and
 * contributes no statements.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/AttachUserPolicyCommand/
 */
export class AttachUserPolicyCommandHandler implements CommandHandler<
  SimAttachUserPolicyCommand,
  SimAttachUserPolicyCommandOutput
> {
  private readonly users: Map<SimIamUsername, SimIamUser>;
  private readonly background: BackgroundScheduler;

  constructor(properties: AttachUserPolicyCommandHandlerProperties) {
    const { users, background = new BackgroundTasks() } = properties;

    this.users = users;
    this.background = background;
  }

  /**
   * Handle an AttachUserPolicyCommand from the SDK.
   */
  async handle(
    command: SimAttachUserPolicyCommand,
  ): Promise<SimAttachUserPolicyCommandOutput> {
    const username = command.input.UserName as SimIamUsername | undefined;
    if (username === undefined || username.length === 0) {
      throw new Error("UserName is required");
    }

    const policyArn = command.input.PolicyArn as SimArn | undefined;
    if (policyArn === undefined || policyArn.length === 0) {
      throw new Error("PolicyArn is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const user = this.users.get(username);

    if (user === undefined) {
      throw new SimIamNoSuchEntity(`No IAM User with name ${username}`);
    }

    user.attachedPolicyArns.add(policyArn);

    return {};
  }
}

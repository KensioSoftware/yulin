import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import { simIamAttachedPolicies } from "../../../policy/sim-iam-managed-policy-lookup.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";
import type {
  SimListAttachedUserPoliciesCommand,
  SimListAttachedUserPoliciesCommandOutput,
} from "./list-attached-user-policies.command.js";

interface ListAttachedUserPoliciesCommandHandlerProperties {
  readonly users: ReadonlyMap<SimIamUsername, SimIamUser>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM ListAttachedUserPoliciesCommand handler.
 *
 * Every attached ARN is listed, including an AWS-managed one outside the
 * catalogue, because the attachment is what is being listed. The whole list
 * comes back in one page.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/ListAttachedUserPoliciesCommand/
 */
export class ListAttachedUserPoliciesCommandHandler implements CommandHandler<
  SimListAttachedUserPoliciesCommand,
  SimListAttachedUserPoliciesCommandOutput
> {
  private readonly users: ReadonlyMap<SimIamUsername, SimIamUser>;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListAttachedUserPoliciesCommandHandlerProperties) {
    const { users, background = new BackgroundTasks() } = properties;

    this.users = users;
    this.background = background;
  }

  /**
   * Handle a ListAttachedUserPoliciesCommand from the SDK.
   */
  async handle(
    command: SimListAttachedUserPoliciesCommand,
  ): Promise<SimListAttachedUserPoliciesCommandOutput> {
    const username = command.input.UserName as SimIamUsername | undefined;

    if (username === undefined || username.length === 0) {
      throw new Error("UserName is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const user = this.users.get(username);

    if (user === undefined) {
      throw new SimIamNoSuchEntity(`No IAM User with name ${username}`);
    }

    return {
      AttachedPolicies: simIamAttachedPolicies(
        user.attachedPolicyArns,
        command.input.PathPrefix,
      ),
      IsTruncated: false,
    };
  }
}

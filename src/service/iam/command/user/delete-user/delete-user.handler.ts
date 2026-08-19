import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import {
  SimIamDeleteConflict,
  SimIamNoSuchEntity,
} from "../../../error/sim-iam.error.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";
import type {
  SimDeleteUserCommand,
  SimDeleteUserCommandOutput,
} from "./delete-user.command.js";

interface DeleteUserCommandHandlerProperties {
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM DeleteUserCommand handler.
 *
 * Real IAM only deletes a User nothing is hanging off, the way DeleteRole
 * refuses a Role still carrying policies. A User with inline policies or
 * attached managed policies is refused here too, which is why a CloudFormation
 * Stack takes a User's policies off before deleting it.
 *
 * Real IAM also refuses a User that still has access keys, a login profile or
 * an MFA device. The simulator serves no way to remove any of those, so
 * refusing on them would leave a User that could never be deleted.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/DeleteUserCommand/
 */
export class DeleteUserCommandHandler implements CommandHandler<
  SimDeleteUserCommand,
  SimDeleteUserCommandOutput
> {
  private readonly users: Map<SimIamUsername, SimIamUser>;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteUserCommandHandlerProperties) {
    const { users, background = new BackgroundTasks() } = properties;

    this.users = users;
    this.background = background;
  }

  /**
   * Handle a DeleteUserCommand from the SDK.
   */
  async handle(
    command: SimDeleteUserCommand,
  ): Promise<SimDeleteUserCommandOutput> {
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

    this.assertNothingAttached(user);
    this.users.delete(username);

    return {};
  }

  private assertNothingAttached(user: SimIamUser): void {
    const attached = user.inlinePolicies.size + user.attachedPolicyArns.size;

    if (attached > 0) {
      throw new SimIamDeleteConflict(
        `Cannot delete entity, must detach all policies first: ` +
          `IAM User ${user.userName}`,
      );
    }
  }
}

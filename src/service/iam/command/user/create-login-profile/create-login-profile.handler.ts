import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import {
  SimIamEntityAlreadyExists,
  SimIamNoSuchEntity,
} from "../../../error/sim-iam.error.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";
import type {
  SimCreateLoginProfileCommand,
  SimCreateLoginProfileCommandOutput,
} from "./create-login-profile.command.js";

interface CreateLoginProfileCommandHandlerProperties {
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM CreateLoginProfileCommand handler.
 *
 * A login profile is the console password of a user. The response describes
 * the profile without the password, which is how real IAM behaves: a password
 * goes in and is never read back out. A test asserting on one reads it from
 * the user record in `SimIam.users`.
 *
 * No password policy is applied. Real IAM validates the password against the
 * account password policy, which the simulator does not model.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/CreateLoginProfileCommand/
 */
export class CreateLoginProfileCommandHandler implements CommandHandler<
  SimCreateLoginProfileCommand,
  SimCreateLoginProfileCommandOutput
> {
  private readonly users: Map<SimIamUsername, SimIamUser>;
  private readonly background: BackgroundScheduler;

  constructor(properties: CreateLoginProfileCommandHandlerProperties) {
    const { users, background = new BackgroundTasks() } = properties;

    this.users = users;
    this.background = background;
  }

  /**
   * Handle a CreateLoginProfileCommand from the SDK.
   */
  async handle(
    command: SimCreateLoginProfileCommand,
  ): Promise<SimCreateLoginProfileCommandOutput> {
    const username = command.input.UserName as SimIamUsername | undefined;
    if (username === undefined || username.length === 0) {
      throw new Error("UserName is required");
    }

    const password = command.input.Password;
    if (password === undefined || password.length === 0) {
      throw new Error("Password is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const user = this.users.get(username);

    if (user === undefined) {
      throw new SimIamNoSuchEntity(`No IAM User with name ${username}`);
    }

    if (user.loginProfile !== undefined) {
      throw new SimIamEntityAlreadyExists(
        `Sim IAM User ${username} already has a login profile`,
      );
    }

    user.loginProfile = {
      password,
      createDate: this.background.now(),
      passwordResetRequired: command.input.PasswordResetRequired ?? false,
    };

    return {
      LoginProfile: {
        UserName: user.userName,
        CreateDate: user.loginProfile.createDate,
        PasswordResetRequired: user.loginProfile.passwordResetRequired,
      },
    };
  }
}

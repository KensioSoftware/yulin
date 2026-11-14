import type { CommandHandler } from "../../../../../command/command-handler.js";
import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import { BackgroundTasks } from "../../../../../util/background/background.js";
import type { SimArn } from "../../../../aws/arn.js";
import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import { assertSimIamNewEntity } from "../../sim-iam-account-quota.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";
import { normaliseUserPath } from "../../../user/sim-iam-user-path.js";
import type {
  SimCreateUserCommand,
  SimCreateUserCommandOutput,
} from "./create-user.command.js";
import { CreateUserRecordFactory } from "./create-user-record-factory.js";

interface CreateUserCommandHandlerProperties {
  readonly accountId: SimAwsAccountId;
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM CreateUser command handler.
 */
export class CreateUserCommandHandler implements CommandHandler<
  SimCreateUserCommand,
  SimCreateUserCommandOutput
> {
  private readonly accountId: SimAwsAccountId;
  private readonly users: Map<SimIamUsername, SimIamUser>;
  private readonly background: BackgroundScheduler;
  private readonly userFactory = new CreateUserRecordFactory();

  constructor(properties: CreateUserCommandHandlerProperties) {
    this.accountId = properties.accountId;
    this.users = properties.users;
    this.background = properties.background ?? new BackgroundTasks();
  }

  /**
   * Handle a Create User Command from the SDK.
   */
  async handle(
    command: SimCreateUserCommand,
  ): Promise<SimCreateUserCommandOutput> {
    const username = command.input.UserName as SimIamUsername | undefined;

    if (username === undefined || username.length === 0) {
      throw new Error("UserName is required");
    }

    const path = normaliseUserPath(command.input.Path);

    await this.background.sequence();

    assertSimIamNewEntity("Users", this.users.keys(), username);

    const user = this.userFactory.makeUser({
      accountId: this.accountId,
      path,
      userName: username,
      creationDate: this.background.now(),
      tags: command.input.Tags,
      permissionsBoundaryArn: command.input.PermissionsBoundary as
        | SimArn
        | undefined,
    });

    this.users.set(username, user);

    return this.userFactory.makeOutput(user);
  }
}

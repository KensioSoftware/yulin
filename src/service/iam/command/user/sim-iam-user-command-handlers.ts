import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimIamCredentialRegistry } from "../../credential/sim-iam-credential-registry.js";
import type { SimIamUserCredentialGenerator } from "../../credential/user/sim-iam-user-credential-generator.js";
import type { SimIamUser, SimIamUsername } from "../../user/sim-iam-user.js";
import { CreateAccessKeyCommandHandler } from "./create-access-key/create-access-key.handler.js";
import type {
  SimCreateAccessKeyCommand,
  SimCreateAccessKeyCommandOutput,
} from "./create-access-key/create-access-key.cmd.js";
import { CreateUserCommandHandler } from "./create-user/create-user.handler.js";
import type {
  SimCreateUserCommand,
  SimCreateUserCommandOutput,
} from "./create-user/create-user.cmd.js";

interface SimIamUserCommandHandlersProperties {
  readonly accountId: SimAwsAccountId;
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly credentialRegistry: SimIamCredentialRegistry;
  readonly credentialGenerator: SimIamUserCredentialGenerator;
  readonly background: BackgroundScheduler;
  readonly authorizer: SimIamActionAuthorizer;
}

/**
 * Wires and runs the SDK command handlers that operate on IAM Users.
 *
 * Grouping the user command wiring here keeps the SimIam facade a thin
 * delegator while keeping all user-keyed command handlers in one cohesive
 * place, mirroring the role command handlers.
 */
export class SimIamUserCommandHandlers {
  private readonly accountId: SimAwsAccountId;
  private readonly users: Map<SimIamUsername, SimIamUser>;
  private readonly credentialRegistry: SimIamCredentialRegistry;
  private readonly credentialGenerator: SimIamUserCredentialGenerator;
  private readonly background: BackgroundScheduler;
  private readonly authorizer: SimIamActionAuthorizer;

  constructor(properties: SimIamUserCommandHandlersProperties) {
    const {
      accountId,
      users,
      credentialRegistry,
      credentialGenerator,
      background,
      authorizer,
    } = properties;

    this.accountId = accountId;
    this.users = users;
    this.credentialRegistry = credentialRegistry;
    this.credentialGenerator = credentialGenerator;
    this.background = background;
    this.authorizer = authorizer;
  }

  /**
   * Handle a CreateUser command from the SDK.
   */
  async createUser(
    command: SimCreateUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateUserCommandOutput> {
    this.authorizer.authorize(
      "iam:CreateUser",
      this.userArn(command.input.UserName),
      options?.caller,
    );
    const handler = new CreateUserCommandHandler({
      accountId: this.accountId,
      users: this.users,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a CreateAccessKey command from the SDK.
   */
  async createAccessKey(
    command: SimCreateAccessKeyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateAccessKeyCommandOutput> {
    this.authorizer.authorize(
      "iam:CreateAccessKey",
      this.userArn(command.input.UserName),
      options?.caller,
    );
    const handler = new CreateAccessKeyCommandHandler({
      users: this.users,
      credentialRegistry: this.credentialRegistry,
      credentialGenerator: this.credentialGenerator,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * The User ARN a command operates on, for authorization.
   */
  private userArn(username: string | undefined): string {
    return `arn:aws:iam::${this.accountId}:user/${username ?? "*"}`;
  }
}

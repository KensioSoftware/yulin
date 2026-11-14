import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import { normaliseUserPath } from "../../user/sim-iam-user-path.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimIamCredentialRegistry } from "../../credential/sim-iam-credential-registry.js";
import type { SimIamUserCredentialGenerator } from "../../credential/user/sim-iam-user-credential-generator.js";
import type { SimIamUser, SimIamUsername } from "../../user/sim-iam-user.js";
import { CreateAccessKeyCommandHandler } from "./create-access-key/create-access-key.handler.js";
import type {
  SimCreateAccessKeyCommand,
  SimCreateAccessKeyCommandOutput,
} from "./create-access-key/create-access-key.command.js";
import { AttachUserPolicyCommandHandler } from "./attach-user-policy/attach-user-policy.handler.js";
import type {
  SimAttachUserPolicyCommand,
  SimAttachUserPolicyCommandOutput,
} from "./attach-user-policy/attach-user-policy.command.js";
import { CreateLoginProfileCommandHandler } from "./create-login-profile/create-login-profile.handler.js";
import type {
  SimCreateLoginProfileCommand,
  SimCreateLoginProfileCommandOutput,
} from "./create-login-profile/create-login-profile.command.js";
import { CreateUserCommandHandler } from "./create-user/create-user.handler.js";
import type {
  SimCreateUserCommand,
  SimCreateUserCommandOutput,
} from "./create-user/create-user.command.js";
import { ListAttachedUserPoliciesCommandHandler } from "./list-attached-user-policies/list-attached-user-policies.handler.js";
import type {
  SimListAttachedUserPoliciesCommand,
  SimListAttachedUserPoliciesCommandOutput,
} from "./list-attached-user-policies/list-attached-user-policies.command.js";
import { DeleteUserCommandHandler } from "./delete-user/delete-user.handler.js";
import type {
  SimDeleteUserCommand,
  SimDeleteUserCommandOutput,
} from "./delete-user/delete-user.command.js";
import { SimIamIdentityAuthorizer } from "../../tag/sim-iam-identity-authorizer.js";

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
  private readonly identity: SimIamIdentityAuthorizer;

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
    this.identity = new SimIamIdentityAuthorizer({
      accountId,
      authorizer,
      entity: "User",
      find: (name): SimIamUser | undefined => users.get(name as SimIamUsername),
    });
  }

  /**
   * Handle a CreateUser command from the SDK.
   */
  async createUser(
    command: SimCreateUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateUserCommandOutput> {
    this.identity.authorizeCreate(
      command.input.UserName,
      normaliseUserPath(command.input.Path),
      command.input.Tags,
      options,
    );
    const handler = new CreateUserCommandHandler({
      accountId: this.accountId,
      users: this.users,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a DeleteUser command from the SDK.
   */
  async deleteUser(
    command: SimDeleteUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimDeleteUserCommandOutput> {
    this.identity.authorize("iam:DeleteUser", command.input.UserName, options);
    const handler = new DeleteUserCommandHandler({
      users: this.users,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle an AttachUserPolicy command from the SDK.
   */
  async attachUserPolicy(
    command: SimAttachUserPolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimAttachUserPolicyCommandOutput> {
    this.identity.authorize(
      "iam:AttachUserPolicy",
      command.input.UserName,
      options,
    );
    const handler = new AttachUserPolicyCommandHandler({
      users: this.users,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a CreateLoginProfile command from the SDK.
   */
  async createLoginProfile(
    command: SimCreateLoginProfileCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateLoginProfileCommandOutput> {
    this.identity.authorize(
      "iam:CreateLoginProfile",
      command.input.UserName,
      options,
    );
    const handler = new CreateLoginProfileCommandHandler({
      users: this.users,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a ListAttachedUserPolicies command from the SDK.
   */
  async listAttachedUserPolicies(
    command: SimListAttachedUserPoliciesCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListAttachedUserPoliciesCommandOutput> {
    this.identity.authorize(
      "iam:ListAttachedUserPolicies",
      command.input.UserName,
      options,
    );
    const handler = new ListAttachedUserPoliciesCommandHandler({
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
    this.identity.authorize(
      "iam:CreateAccessKey",
      command.input.UserName,
      options,
    );
    const handler = new CreateAccessKeyCommandHandler({
      users: this.users,
      credentialRegistry: this.credentialRegistry,
      credentialGenerator: this.credentialGenerator,
      background: this.background,
    });
    return await handler.handle(command);
  }
}

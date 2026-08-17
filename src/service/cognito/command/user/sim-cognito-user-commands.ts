import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCognitoPoolMessenger } from "../../user-pool/message/sim-cognito-pool-messenger.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoUserFactory } from "../../user-pool/user/sim-cognito-user-factory.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import { SimCognitoUnsimulatedUserOptions } from "./sim-cognito-unsimulated-user-options.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import { simCognitoValidationData } from "../sim-cognito-validation-data.js";
import type { SimCognitoTokenUser } from "./sim-cognito-token-user.js";
import { SimCognitoUserView } from "./sim-cognito-user-view.js";
import type {
  SimGetUserCommand,
  SimGetUserCommandOutput,
} from "./user-mfa.command.js";
import type {
  SimAdminCreateUserCommand,
  SimAdminCreateUserCommandOutput,
  SimAdminDeleteUserCommand,
  SimAdminDeleteUserCommandOutput,
  SimAdminGetUserCommand,
  SimAdminGetUserCommandOutput,
} from "./user.command.js";

interface SimCognitoUserCommandsProperties {
  readonly resolver: SimCognitoRequestResolver;
  readonly tokenUser: SimCognitoTokenUser;
  readonly userFactory: SimCognitoUserFactory;
  readonly triggers: SimCognitoUserPoolTriggers;
  readonly messenger: SimCognitoPoolMessenger;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that create, read and delete a simulated user.
 *
 * Each one authorizes against the pool's ARN, because a user has no ARN of its
 * own.
 */
export class SimCognitoUserCommands {
  private readonly resolver: SimCognitoRequestResolver;
  private readonly tokenUser: SimCognitoTokenUser;
  private readonly userFactory: SimCognitoUserFactory;
  private readonly triggers: SimCognitoUserPoolTriggers;
  private readonly messenger: SimCognitoPoolMessenger;
  private readonly view = new SimCognitoUserView();
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedUserOptions();

  constructor(properties: SimCognitoUserCommandsProperties) {
    this.resolver = properties.resolver;
    this.tokenUser = properties.tokenUser;
    this.userFactory = properties.userFactory;
    this.triggers = properties.triggers;
    this.messenger = properties.messenger;
  }

  /**
   * Create a user in a pool.
   *
   * The user is left in `FORCE_CHANGE_PASSWORD`, as real Cognito leaves an
   * admin-created user: it has a temporary password and cannot sign in until
   * that password is replaced. `AdminSetUserPassword` with `Permanent: true`
   * is what moves it on. A request naming no `TemporaryPassword` leaves the
   * user with no password at all, so name one when the test means to sign in.
   *
   * The pool's `PreSignUp` trigger runs before the user is added, reporting
   * `PreSignUp_AdminCreateUser`, so a handler that throws leaves the pool
   * without the user. What the handler wrote into the response is read and not
   * acted on, because real Cognito ignores `autoConfirmUser`, `autoVerifyEmail`
   * and `autoVerifyPhone` on this occasion: the user is already past
   * confirmation.
   *
   * `PostConfirmation` does not run, here or on real Cognito. It fires for
   * users who sign themselves up, and an admin-created user never confirms
   * anything.
   *
   * The pool records the invitation it would have sent, carrying the temporary
   * password, unless the request asked for `MessageAction: SUPPRESS`. That is
   * what makes suppressing mean something here rather than being accepted and
   * changing nothing.
   */
  async create(
    command: SimAdminCreateUserCommand,
    options?: SimCognitoCommandOptions,
  ): Promise<SimAdminCreateUserCommandOutput> {
    const { input } = command;
    const pool = this.resolver.pool(
      "cognito-idp:AdminCreateUser",
      input.UserPoolId,
      options,
    );
    const requested = requireSimCognitoUsername(input.Username);

    this.unsimulatedOptions.refuseInCreate(input);

    // A pool signing users in by email or phone number stores a generated
    // UUID as the username here too, so an admin-created user and one that
    // signed itself up are identified the same way.
    const identity = pool.settings.usernameAttributes.identify(
      requested,
      input.UserAttributes,
    );

    const user = this.userFactory.make({
      username: identity.username,
      attributes: identity.attributes,
      schema: pool.settings.schema,
      temporaryPassword: input.TemporaryPassword,
      passwordPolicy: pool.settings.passwordPolicy,
    });

    await this.triggers.preSignUp(SimCognitoTriggerOccasion.adminCreateUser, {
      pool,
      user,
      clientMetadata: input.ClientMetadata,
      validationData: simCognitoValidationData(
        input.ValidationData,
        "AdminCreateUser",
      ),
    });

    pool.addUser(user);

    if (input.MessageAction !== "SUPPRESS") {
      await this.messenger.send({
        pool,
        user,
        occasion: "AdminCreateUser",
        code: input.TemporaryPassword,
        clientMetadata: input.ClientMetadata,
      });
    }

    return { $metadata: {}, User: this.view.entry(user) };
  }

  /**
   * Read a user by username.
   */
  get(
    command: SimAdminGetUserCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminGetUserCommandOutput {
    const user = this.resolver.user(
      "cognito-idp:AdminGetUser",
      command.input,
      options,
    );

    return { $metadata: {}, ...this.view.describe(user) };
  }

  /**
   * Read the user an access token was issued to.
   *
   * This is the client-side read, so the access token is the whole of the
   * authorization and no IAM policy is evaluated, as real Cognito evaluates
   * none for it. What it reports is narrower than `AdminGetUser`: the user's
   * attributes and the factors it has registered, and nothing about its
   * status.
   */
  getUser(command: SimGetUserCommand): SimGetUserCommandOutput {
    const { user } = this.tokenUser.require(
      command.input.AccessToken,
      "GetUser",
    );

    return { $metadata: {}, ...this.view.self(user) };
  }

  /**
   * Delete a user from a pool.
   */
  delete(
    command: SimAdminDeleteUserCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminDeleteUserCommandOutput {
    const { pool, user } = this.resolver.poolUser(
      "cognito-idp:AdminDeleteUser",
      command.input,
      options,
    );

    pool.removeUser(user);

    return { $metadata: {} };
  }
}

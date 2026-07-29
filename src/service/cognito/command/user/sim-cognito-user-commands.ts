import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoPasswordCheck } from "../../user-pool/sim-cognito-password-check.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUserFactory } from "../../user-pool/user/sim-cognito-user-factory.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import { SimCognitoUnsimulatedUserOptions } from "./sim-cognito-unsimulated-user-options.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import { SimCognitoUserView } from "./sim-cognito-user-view.js";
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
  readonly userFactory: SimCognitoUserFactory;
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
  private readonly userFactory: SimCognitoUserFactory;
  private readonly view = new SimCognitoUserView();
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedUserOptions();

  constructor(properties: SimCognitoUserCommandsProperties) {
    this.resolver = properties.resolver;
    this.userFactory = properties.userFactory;
  }

  /**
   * Check a temporary password against the pool's policy.
   *
   * A request naming no temporary password is fine: real Cognito generates one
   * and sends it to the user. Nothing is delivered here, and the generated
   * password would be unusable anyway, so none is generated.
   */
  private static requireAllowedTemporaryPassword(
    pool: SimCognitoUserPool,
    temporaryPassword: string | undefined,
  ): void {
    if (temporaryPassword === undefined) {
      return;
    }

    new SimCognitoPasswordCheck(pool.passwordPolicy).require(
      "TemporaryPassword",
      temporaryPassword,
    );
  }

  /**
   * Create a user in a pool.
   *
   * The user is left in `FORCE_CHANGE_PASSWORD`, as real Cognito leaves an
   * admin-created user: it has a temporary password and cannot sign in until
   * that password is replaced. `AdminSetUserPassword` with `Permanent: true`
   * is what moves it on.
   */
  create(
    command: SimAdminCreateUserCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminCreateUserCommandOutput {
    const { input } = command;
    const pool = this.resolver.pool(
      "cognito-idp:AdminCreateUser",
      input.UserPoolId,
      options,
    );
    const username = requireSimCognitoUsername(input.Username);

    this.unsimulatedOptions.refuseInCreate(input);
    SimCognitoUserCommands.requireAllowedTemporaryPassword(
      pool,
      input.TemporaryPassword,
    );

    const user = this.userFactory.make({
      username,
      attributes: input.UserAttributes,
    });

    pool.addUser(user);

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

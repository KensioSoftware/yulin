import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import type {
  SimAdminUserGlobalSignOutCommand,
  SimAdminUserGlobalSignOutCommandOutput,
  SimGlobalSignOutCommand,
  SimGlobalSignOutCommandOutput,
} from "./auth.command.js";

interface SimCognitoSignOutCommandsProperties {
  readonly resolver: SimCognitoRequestResolver;
  readonly pools: SimCognitoUserPoolStore;
  readonly clock: SimClock;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that sign a user out of every session it has.
 *
 * Both forget the refresh and access tokens the user holds, so a later
 * `REFRESH_TOKEN_AUTH` fails and the access token that signed out cannot sign
 * out again. Real Cognito revokes them the same way. Where they differ is
 * authorization: `GlobalSignOut` is authorized by the user's own access token
 * and evaluates no IAM policy, and `AdminUserGlobalSignOut` is an
 * administrative call that needs the IAM permission on the pool.
 */
export class SimCognitoSignOutCommands {
  private readonly resolver: SimCognitoRequestResolver;
  private readonly pools: SimCognitoUserPoolStore;
  private readonly clock: SimClock;

  constructor(properties: SimCognitoSignOutCommandsProperties) {
    this.resolver = properties.resolver;
    this.pools = properties.pools;
    this.clock = properties.clock;
  }

  /**
   * Sign out the user an access token was issued to.
   */
  globalSignOut(
    command: SimGlobalSignOutCommand,
  ): SimGlobalSignOutCommandOutput {
    const accessToken = command.input.AccessToken;

    if (accessToken === undefined || accessToken === "") {
      throw new SimCognitoInvalidParameterException(
        "AccessToken is required: sign out the user it was issued to",
      );
    }

    const { pool, token } = this.pools.requireAccessToken(
      accessToken,
      this.clock.now(),
    );

    pool.auth.signOut(token.username);

    return { $metadata: {} };
  }

  /**
   * Sign out a user an administrator names.
   */
  adminUserGlobalSignOut(
    command: SimAdminUserGlobalSignOutCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminUserGlobalSignOutCommandOutput {
    const { pool, user } = this.resolver.poolUser(
      "cognito-idp:AdminUserGlobalSignOut",
      command.input,
      options,
    );

    pool.auth.signOut(user.username);

    return { $metadata: {} };
  }
}

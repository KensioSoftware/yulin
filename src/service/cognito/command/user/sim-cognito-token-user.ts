import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import type { SimCognitoUserInPool } from "../sim-cognito-request-resolver.js";

interface SimCognitoTokenUserProperties {
  readonly pools: SimCognitoUserPoolStore;
  readonly clock: SimClock;
}

/**
 * Resolves the user an access token was issued to.
 *
 * This is what the operations a user performs on itself start with, in the way
 * `SimCognitoRequestResolver` is what an administrative operation starts with.
 * The token is the whole of the authorization: real Cognito evaluates no IAM
 * policy for these, because they are what an application calls on behalf of
 * someone signed in, holding no AWS credentials at all. It also says which
 * pool the request is for, so none of them names one.
 */
export class SimCognitoTokenUser {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly clock: SimClock;

  constructor(properties: SimCognitoTokenUserProperties) {
    this.pools = properties.pools;
    this.clock = properties.clock;
  }

  /**
   * Resolve the user an access token names, and the pool that signed it.
   */
  require(
    accessToken: string | undefined,
    operation: string,
  ): SimCognitoUserInPool {
    if (accessToken === undefined || accessToken === "") {
      throw new SimCognitoInvalidParameterException(
        `${operation} needs an AccessToken: it acts on the user the token ` +
          `was issued to`,
      );
    }

    const { pool, token } = this.pools.requireAccessToken(
      accessToken,
      this.clock.now(),
    );

    return {
      pool,
      user: pool.requireUser(requireSimCognitoUsername(token.username)),
    };
  }
}

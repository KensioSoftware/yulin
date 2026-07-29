import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { requireSimCognitoSecretHash } from "../../user-pool/auth/sim-cognito-secret-hash.js";
import { requireSimCognitoEnabled } from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import { SimCognitoAuthenticationResult } from "./sim-cognito-authentication-result.js";
import type { SimCognitoAuthRequest } from "./sim-cognito-password-sign-in.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoRefreshSignInProperties {
  readonly tokenIssuer: SimCognitoTokenIssuer;
  readonly clock: SimClock;
}

/**
 * Trading a refresh token for a new access and id token.
 *
 * The refresh token names no user: the pool that issued it is what knows whose
 * it is, which is why one presented to another app client is refused. Nothing
 * new comes back with the tokens, because real Cognito issues no new refresh
 * token here, so a client keeps the one it has until that expires.
 */
export class SimCognitoRefreshSignIn {
  private readonly tokenIssuer: SimCognitoTokenIssuer;
  private readonly clock: SimClock;
  private readonly result = new SimCognitoAuthenticationResult();

  constructor(properties: SimCognitoRefreshSignInProperties) {
    this.tokenIssuer = properties.tokenIssuer;
    this.clock = properties.clock;
  }

  /**
   * Refresh a session, or refuse the token it was asked for with.
   */
  handle(request: SimCognitoAuthRequest): SimCognitoAuthenticationOutput {
    const { pool, client, parameters } = request;
    const refreshToken = pool.auth.requireRefreshToken({
      value: parameters.require("REFRESH_TOKEN"),
      clientId: client.id,
      now: this.clock.now(),
    });

    // The hash covers the username, and the request carries none, so the one
    // the token was issued to is what it has to have been computed with.
    requireSimCognitoSecretHash(
      refreshToken.username,
      client,
      parameters.find("SECRET_HASH"),
    );

    const user = pool.requireUser(
      requireSimCognitoUsername(refreshToken.username),
    );

    requireSimCognitoEnabled(user);

    return {
      $metadata: {},
      AuthenticationResult: this.result.of(
        this.tokenIssuer.reissue({ pool, client, user }),
      ),
    };
  }
}

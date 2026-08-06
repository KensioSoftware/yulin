import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { requireSimCognitoSecretHash } from "../../user-pool/auth/sim-cognito-secret-hash.js";
import { requireSimCognitoEnabled } from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
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
 *
 * The pool's `PreTokenGeneration` trigger runs for the reissued tokens, as it
 * does on real Cognito, so a claim it changed since the sign-in is on the token
 * a refresh answers with rather than being stale for the life of the session.
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
  async handle(
    request: SimCognitoAuthRequest,
  ): Promise<SimCognitoAuthenticationOutput> {
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

    // A refresh runs through `InitiateAuth`, whose `ClientMetadata` real
    // Cognito does not pass to the token trigger, so none travels with these
    // tokens.
    return {
      $metadata: {},
      AuthenticationResult: this.result.of(
        await this.tokenIssuer.reissue({
          pool,
          client,
          user,
          occasion: SimCognitoTriggerOccasion.refreshTokenGeneration,
        }),
      ),
    };
  }
}

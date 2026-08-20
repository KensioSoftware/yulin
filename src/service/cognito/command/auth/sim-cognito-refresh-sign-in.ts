import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import { requireSimCognitoSecretHash } from "../../user-pool/auth/sim-cognito-secret-hash.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoRefreshedTokens } from "./sim-cognito-refreshed-tokens.js";
import type { SimCognitoAuthRequest } from "./sim-cognito-password-sign-in.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoRefreshSignInProperties {
  readonly refreshedTokens: SimCognitoRefreshedTokens;
  readonly clock: SimClock;
}

/**
 * Refuse a refresh through an app client that rotates its refresh tokens.
 *
 * Rotation and `REFRESH_TOKEN_AUTH` do not go together on real Cognito, which
 * is why `aws-cdk-lib` drops `ALLOW_REFRESH_TOKEN_AUTH` from a client the
 * moment it is given a rotation grace period. A client that kept the flow
 * anyway is told where the operation went rather than handed tokens the real
 * pool would not have handed it.
 */
function requireSimCognitoNoRotation(client: SimCognitoUserPoolClient): void {
  if (!client.refreshTokenRotation.enabled) {
    return;
  }

  throw new SimCognitoInvalidParameterException(
    `REFRESH_TOKEN_AUTH is not available on the client ${client.id}: it ` +
      `rotates its refresh tokens, so renew the session with ` +
      `GetTokensFromRefreshToken instead`,
  );
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
  private readonly refreshedTokens: SimCognitoRefreshedTokens;
  private readonly clock: SimClock;

  constructor(properties: SimCognitoRefreshSignInProperties) {
    this.refreshedTokens = properties.refreshedTokens;
    this.clock = properties.clock;
  }

  /**
   * Refresh a session, or refuse the token it was asked for with.
   */
  async handle(
    request: SimCognitoAuthRequest,
  ): Promise<SimCognitoAuthenticationOutput> {
    const { pool, client, parameters } = request;

    requireSimCognitoNoRotation(client);

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

    // A refresh runs through `InitiateAuth`, whose `ClientMetadata` real
    // Cognito does not pass to the token trigger, so none travels with these
    // tokens.
    return {
      $metadata: {},
      AuthenticationResult: await this.refreshedTokens.issue({
        pool,
        client,
        refreshToken,
      }),
    };
  }
}

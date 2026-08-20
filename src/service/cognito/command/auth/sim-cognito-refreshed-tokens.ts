import type { SimCognitoIssuedToken } from "../../user-pool/auth/sim-cognito-issued-token.js";
import { requireSimCognitoEnabled } from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import { SimCognitoAuthenticationResult } from "./sim-cognito-authentication-result.js";
import type { SimCognitoAuthenticationResultType } from "./auth.command.js";

interface SimCognitoRefreshedTokensProperties {
  readonly tokenIssuer: SimCognitoTokenIssuer;
}

/**
 * What a refresh has to name for tokens to come back: the pool, the app client
 * it goes through, and the refresh token the pool has already accepted.
 */
interface SimCognitoRefreshedTokensRequest {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly refreshToken: SimCognitoIssuedToken;

  /**
   * The `ClientMetadata` the request carried, which reaches the pool's token
   * trigger. A `REFRESH_TOKEN_AUTH` refresh passes none, as real Cognito
   * passes none from `InitiateAuth`.
   */
  readonly clientMetadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * The tokens a refresh answers with, whichever operation asked for them.
 *
 * `REFRESH_TOKEN_AUTH` and `GetTokensFromRefreshToken` prove the caller
 * differently and reach the pool differently, and once the refresh token is
 * accepted they answer the same way, so what they share is here.
 *
 * Which app client the refresh went through decides whether a new refresh
 * token comes back. A rotating client hands one out and spends the token that
 * bought it, and a client with rotation off answers with the access and id
 * token alone, leaving the caller the token it already has.
 *
 * The pool's `PreTokenGeneration` trigger runs for the reissued tokens either
 * way, as it does on real Cognito, so a claim it changed since the sign-in is
 * on the token a refresh answers with rather than being stale for the life of
 * the session.
 */
export class SimCognitoRefreshedTokens {
  private readonly tokenIssuer: SimCognitoTokenIssuer;
  private readonly result = new SimCognitoAuthenticationResult();

  constructor(properties: SimCognitoRefreshedTokensProperties) {
    this.tokenIssuer = properties.tokenIssuer;
  }

  /**
   * Reissue a session's tokens, rotating its refresh token where the app
   * client rotates.
   *
   * The refresh token names no user: the pool that issued it is what knows
   * whose it is, which is why the user is looked up from the token rather than
   * from the request.
   */
  async issue(
    request: SimCognitoRefreshedTokensRequest,
  ): Promise<SimCognitoAuthenticationResultType> {
    const { pool, client, refreshToken, clientMetadata } = request;
    const user = pool.requireUser(
      requireSimCognitoUsername(refreshToken.username),
    );

    requireSimCognitoEnabled(user);

    return this.result.of(
      await this.tokenIssuer.refresh({
        pool,
        client,
        user,
        clientMetadata,
        spent: refreshToken,
        occasion: SimCognitoTriggerOccasion.refreshTokenGeneration,
      }),
    );
  }
}

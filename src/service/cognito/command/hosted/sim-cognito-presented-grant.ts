import { SimCognitoOAuthError } from "../../error/sim-cognito-oauth.error.js";
import type { SimCognitoAuthorizationCode } from "../../user-pool/auth/sim-cognito-authorization-code.js";
import type { SimCognitoIssuedToken } from "../../user-pool/auth/sim-cognito-issued-token.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import type { SimCognitoTokenInput } from "./hosted-auth.command.js";

interface SimCognitoPresentedGrantRequest {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly input: SimCognitoTokenInput;
  readonly now: Date;
}

/**
 * What a token request presented, once everything that could be wrong with it
 * has been checked.
 *
 * This is where a grant most often fails, and each way of failing has its own
 * answer, so the checking lives here rather than among the token issuing.
 */
export class SimCognitoPresentedGrant {
  /**
   * Take the authorization code a request carries, or refuse.
   *
   * The code is spent whether or not the rest of the request turns out to be
   * right, as real Cognito spends one, so nothing can be retried with a code
   * that has already been presented.
   */
  code(request: SimCognitoPresentedGrantRequest): SimCognitoAuthorizationCode {
    const { pool, client, input, now } = request;
    const code = pool.auth.spendAuthorizationCode(input.code, now);

    if (code === undefined || !code.isFor(client.id)) {
      throw new SimCognitoOAuthError({
        code: "invalid_grant",
        description:
          "The authorization code has been used already, has run out, or " +
          "was not issued to this app client",
        redirectable: false,
      });
    }

    this.requireMatchingRedirect(code, input.redirect_uri);
    this.requireVerifier(code, input.code_verifier);

    return code;
  }

  /**
   * Take the refresh token a request carries, or refuse.
   */
  refreshToken(
    request: SimCognitoPresentedGrantRequest,
  ): SimCognitoIssuedToken {
    const { pool, client, input, now } = request;
    const found = pool.auth.findRefreshToken(input.refresh_token);

    if (
      found === undefined ||
      !found.isFor(client.id) ||
      found.isSpentAt(now)
    ) {
      throw new SimCognitoOAuthError({
        code: "invalid_grant",
        description:
          "The refresh token has been revoked, has run out, or was not " +
          "issued to this app client",
        redirectable: false,
      });
    }

    return found;
  }

  /**
   * The user a grant was made for, which the pool may no longer hold.
   */
  user(pool: SimCognitoUserPool, username: string): SimCognitoUser {
    const user = pool.findUser(username);

    if (user === undefined || !user.enabled) {
      throw new SimCognitoOAuthError({
        code: "invalid_grant",
        description:
          `The user this grant was made for is disabled or no longer in ` +
          `user pool ${pool.id}`,
        redirectable: false,
      });
    }

    return user;
  }

  /**
   * Refuse a redirect URI that is not the one the code was issued for.
   *
   * Real Cognito answers this with `unauthorized_client` rather than with
   * `invalid_grant`, and says `invalid_redirect` in the description.
   */
  private requireMatchingRedirect(
    code: SimCognitoAuthorizationCode,
    redirectUri: string | undefined,
  ): void {
    if (!code.isForRedirect(redirectUri)) {
      throw new SimCognitoOAuthError({
        code: "unauthorized_client",
        description:
          "invalid_redirect: redirect_uri is not the one the authorization " +
          "code was issued for",
        redirectable: false,
      });
    }
  }

  private requireVerifier(
    code: SimCognitoAuthorizationCode,
    codeVerifier: string | undefined,
  ): void {
    if (!code.matchesVerifier(codeVerifier)) {
      throw new SimCognitoOAuthError({
        code: "invalid_grant",
        description:
          "code_verifier is not the verifier the authorization request's " +
          "code_challenge was derived from",
        redirectable: false,
      });
    }
  }
}

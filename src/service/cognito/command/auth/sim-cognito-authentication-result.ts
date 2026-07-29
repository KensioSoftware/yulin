import type { SimCognitoIssuedTokens } from "../../user-pool/token/sim-cognito-token-issuer.js";
import type { SimCognitoAuthenticationResultType } from "./auth.command.js";

/**
 * How issued tokens are reported back to a caller.
 */
export class SimCognitoAuthenticationResult {
  /**
   * The tokens as an `AuthenticationResult`.
   *
   * `ExpiresIn` is the access token's lifetime in seconds, which is what real
   * Cognito reports there, and `TokenType` is always `Bearer`. A refresh
   * carries no `RefreshToken` at all, rather than an empty one, because that
   * is what a caller keeping the token it already has has to notice.
   */
  of(tokens: SimCognitoIssuedTokens): SimCognitoAuthenticationResultType {
    const issued = {
      AccessToken: tokens.accessToken,
      IdToken: tokens.idToken,
      ExpiresIn: tokens.expiresIn,
      TokenType: "Bearer",
    };

    if (tokens.refreshToken === undefined) {
      return issued;
    }

    return { ...issued, RefreshToken: tokens.refreshToken };
  }
}

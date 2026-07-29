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
   * Cognito reports there, and `TokenType` is always `Bearer`.
   */
  of(tokens: SimCognitoIssuedTokens): SimCognitoAuthenticationResultType {
    return {
      AccessToken: tokens.accessToken,
      IdToken: tokens.idToken,
      RefreshToken: tokens.refreshToken,
      ExpiresIn: tokens.expiresIn,
      TokenType: "Bearer",
    };
  }
}

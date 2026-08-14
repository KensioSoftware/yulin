import type { SimCognitoIssuedTokens } from "../../user-pool/token/sim-cognito-token-issuer.js";
import type { SimCognitoTokenOutput } from "./hosted-auth.command.js";

/**
 * The token type every OAuth 2.0 bearer token is.
 */
const bearerTokenType = "Bearer";

/**
 * The scope that makes a grant carry an id token.
 */
const openIdScope = "openid";

/**
 * What the token endpoint answers a completed grant with.
 *
 * An id token comes back only where the grant was made with the `openid`
 * scope, as it does on real Cognito, and a refresh token only where the grant
 * issued one: a refresh answers with none.
 */
export class SimCognitoGrantedTokens {
  /**
   * The answer to a completed grant.
   */
  body(
    issued: SimCognitoIssuedTokens,
    scopes: readonly string[],
  ): SimCognitoTokenOutput {
    return {
      access_token: issued.accessToken,
      ...(scopes.includes(openIdScope) && { id_token: issued.idToken }),
      ...(issued.refreshToken !== undefined && {
        refresh_token: issued.refreshToken,
      }),
      token_type: bearerTokenType,
      expires_in: issued.expiresIn,
    };
  }
}

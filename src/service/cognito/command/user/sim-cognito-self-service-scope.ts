import { SimCognitoNotAuthorizedException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIssuedToken } from "../../user-pool/auth/sim-cognito-issued-token.js";

/**
 * Refuse an operation a user performs on itself where the access token was
 * never granted the scope real Cognito needs for one.
 *
 * A token from an API sign-in always carries
 * `aws.cognito.signin.user.admin`, and a token from a hosted sign-in carries
 * it only where the app client asked for it among its `AllowedOAuthScopes`. A
 * hosted sign-in granted `openid email` alone can read its own claims and
 * nothing else, so letting one through here would pass code a deployment
 * refuses.
 */
export function requireSimCognitoSelfService(
  token: SimCognitoIssuedToken,
  operation: string,
): void {
  if (token.actsForUser) {
    return;
  }

  throw new SimCognitoNotAuthorizedException(
    `Access Token does not have required scopes: ${operation} needs the ` +
      `aws.cognito.signin.user.admin scope, which this sign-in was not granted`,
  );
}

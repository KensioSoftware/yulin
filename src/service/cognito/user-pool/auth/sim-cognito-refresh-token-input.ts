import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * Read the refresh token a request was made with, or refuse a request that
 * carries none.
 *
 * `GetTokensFromRefreshToken` names the token in an input of its own rather
 * than among `AuthParameters`, which is why this is not the check
 * `REFRESH_TOKEN_AUTH` makes. It is required on real Cognito, so an empty one
 * is as missing as an absent one.
 */
export function requireSimCognitoRefreshTokenInput(
  value: string | undefined,
): string {
  if (value === undefined || value === "") {
    throw new SimCognitoInvalidParameterException(
      "Missing required parameter RefreshToken",
    );
  }

  return value;
}

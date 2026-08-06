/**
 * Signing the fixture's user in, and reading the tokens back.
 *
 * The `PreTokenGeneration` suites assert on what a token carries rather than on
 * what a handler was given, so the sign-in and the claim reading live here
 * rather than in `trigger-fixture.ts`, which owns the pool and the user.
 */

import { InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { assertNonNullable } from "@kensio/smartass";

import {
  triggerPassword,
  triggerUsername,
  type SimCognitoTriggerPool,
} from "./trigger-fixture.js";

/**
 * The tokens a sign-in through the fixture's app client answered with.
 */
export interface SimCognitoTriggerTokens {
  readonly idToken: string;
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * Sign the fixture's user in through the client-side flow.
 */
export async function signInToTriggerPool(
  pool: SimCognitoTriggerPool,
  clientMetadata?: Readonly<Record<string, string>>,
): Promise<SimCognitoTriggerTokens> {
  const signedIn = await pool.cognito.initiateAuth(
    new InitiateAuthCommand({
      ClientId: pool.clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: triggerUsername, PASSWORD: triggerPassword },
      ...(clientMetadata !== undefined && { ClientMetadata: clientMetadata }),
    }),
  );

  assertNonNullable(signedIn.AuthenticationResult?.IdToken);
  assertNonNullable(signedIn.AuthenticationResult.AccessToken);
  assertNonNullable(signedIn.AuthenticationResult.RefreshToken);

  return {
    idToken: signedIn.AuthenticationResult.IdToken,
    accessToken: signedIn.AuthenticationResult.AccessToken,
    refreshToken: signedIn.AuthenticationResult.RefreshToken,
  };
}

/**
 * The claims one signed token carries, which is the middle part of the JWT.
 */
export function triggerTokenClaims(token: string): Record<string, unknown> {
  const [, claims] = token.split(".");

  return JSON.parse(
    Buffer.from(claims ?? "", "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

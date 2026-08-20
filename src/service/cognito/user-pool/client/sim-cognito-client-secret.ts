/* oxlint-disable security/detect-possible-timing-attacks -- this is a
   simulator in one process, where the client secret is checked so a test
   notices one it forgot to send, rather than as a defence against anyone
   measuring how long the check took. */
import { faker } from "@faker-js/faker";
import { SimCognitoNotAuthorizedException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolClient } from "./sim-cognito-user-pool-client.js";

/**
 * Real client secrets are fifty-two lowercase alphanumerics. The length is
 * worth matching because application code sometimes carries an assertion or a
 * configuration check on it.
 */
const clientSecretLength = 52;

/**
 * Generate an app client secret.
 *
 * Only a client created with `GenerateSecret` has one. A client without a
 * secret reports no `ClientSecret` at all rather than an empty one, which is
 * what makes code computing a `SECRET_HASH` fail on the client it should fail
 * on.
 */
export function makeSimCognitoClientSecret(): string {
  return faker.string.alphanumeric({
    length: clientSecretLength,
    casing: "lower",
  });
}

/**
 * Refuse a request whose `ClientSecret` is missing or wrong.
 *
 * `GetTokensFromRefreshToken` proves the caller with the secret itself rather
 * than with a `SECRET_HASH`, because the request names no user for a hash to
 * be computed over. A client without a secret needs none, and one sent anyway
 * is ignored, as real Cognito ignores it.
 */
export function requireSimCognitoClientSecret(
  client: SimCognitoUserPoolClient,
  clientSecret: string | undefined,
): void {
  const { secret } = client;

  if (secret === undefined) {
    return;
  }

  if (clientSecret !== secret) {
    throw new SimCognitoNotAuthorizedException(
      `Invalid client secret for client ${client.id}.`,
    );
  }
}

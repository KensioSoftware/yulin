import { faker } from "@faker-js/faker";

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

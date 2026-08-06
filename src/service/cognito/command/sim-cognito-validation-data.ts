import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";
import type { SimCognitoAttributeType } from "../user-pool/user/sim-cognito-user-attributes.js";

/**
 * Read the `ValidationData` a sign-up or a user creation carried.
 *
 * The request sends `Name`/`Value` pairs and a `PreSignUp` handler reads a
 * plain object of strings, so the two shapes are not the same. The names are
 * not checked against the pool's schema, because this is never stored on the
 * user: real Cognito passes it to the trigger and forgets it.
 *
 * A request that sent none reaches the handler with no `validationData` at all,
 * rather than with an empty object.
 */
export function simCognitoValidationData(
  requested: readonly SimCognitoAttributeType[] | undefined,
  operation: string,
): Readonly<Record<string, string>> | undefined {
  if (requested === undefined) {
    return undefined;
  }

  return Object.fromEntries(
    requested.map((entry) => [
      requireValidationDataName(entry.Name, operation),
      entry.Value ?? "",
    ]),
  );
}

function requireValidationDataName(
  name: string | undefined,
  operation: string,
): string {
  if (name === undefined || name === "") {
    throw new SimCognitoInvalidParameterException(
      `${operation} ValidationData needs a Name on every entry, saying what ` +
        `the pre sign-up trigger reads it as`,
    );
  }

  return name;
}

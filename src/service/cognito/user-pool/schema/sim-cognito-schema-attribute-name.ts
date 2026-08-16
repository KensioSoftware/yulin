import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * The prefix Cognito puts on an attribute a pool declared for itself.
 */
export const simCognitoCustomAttributePrefix = "custom:";

/**
 * The prefix Cognito puts on a developer-only attribute, which is not
 * simulated.
 */
export const simCognitoDeveloperAttributePrefix = "dev:";

/**
 * How long the name of a custom attribute may be, before its prefix.
 */
const maxCustomNameLength = 20;

/**
 * The characters Cognito takes in an attribute name: letters, marks, symbols,
 * numbers and punctuation. A space is in none of them, which is the one most
 * often written.
 */
const customNamePattern = /^[\p{L}\p{M}\p{S}\p{N}\p{P}]+$/u;

/**
 * The name Cognito holds a declared attribute under.
 *
 * A custom attribute is written under a `custom:` name, because that is the
 * name real Cognito gives it: a `Schema` naming `userId` is set and read as
 * `custom:userId`, and code that writes the bare name works against neither.
 *
 * Cognito adds that prefix itself, so a declaration already carrying one is
 * refused: it would otherwise be written as `custom:custom:userId` here and on
 * AWS alike, and a request setting `custom:userId` would find nothing.
 */
export function simCognitoSchemaAttributeName(
  name: string | undefined,
  custom: boolean,
): string {
  if (name === undefined || name === "") {
    throw new SimCognitoInvalidParameterException(
      "A Schema attribute needs a Name saying what the pool is to call it",
    );
  }

  if (!custom) {
    return name;
  }

  requireBareName(name);

  if (name.length > maxCustomNameLength) {
    throw new SimCognitoInvalidParameterException(
      `Schema attribute '${name}' is too long: a custom attribute name is ` +
        `at most ${String(maxCustomNameLength)} characters`,
    );
  }

  if (!customNamePattern.test(name)) {
    throw new SimCognitoInvalidParameterException(
      `Schema attribute '${name}' has a character Cognito does not take in ` +
        `an attribute name: a name is letters, marks, symbols, numbers and ` +
        `punctuation, and a space is none of those`,
    );
  }

  return `${simCognitoCustomAttributePrefix}${name}`;
}

/**
 * Refuse a declaration that wrote the prefix Cognito adds.
 */
function requireBareName(name: string): void {
  if (
    !name.startsWith(simCognitoCustomAttributePrefix) &&
    !name.startsWith(simCognitoDeveloperAttributePrefix)
  ) {
    return;
  }

  const bare = name.slice(name.indexOf(":") + 1);

  throw new SimCognitoInvalidParameterException(
    `Schema attribute '${name}' names its own prefix: Cognito adds the ` +
      `'${simCognitoCustomAttributePrefix}' itself, so declare '${bare}' and ` +
      `set it as '${simCognitoCustomAttributePrefix}${bare}'`,
  );
}

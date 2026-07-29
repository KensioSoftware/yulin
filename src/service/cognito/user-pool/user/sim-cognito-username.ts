import type { Brand } from "../../../../util/brand.type.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

export type SimCognitoUsername = Brand<string, "SimCognitoUsername">;

const maxUsernameLength = 128;

/**
 * The characters Cognito allows in a username: letters, marks, symbols,
 * numbers and punctuation, and no whitespace among them.
 */
const usernamePattern = /^[\p{L}\p{M}\p{S}\p{N}\p{P}]+$/u;

/**
 * Read a requested username, or refuse a malformed one.
 *
 * A username is the identifier every admin operation names a user by, so it
 * is validated before anything is looked up: a value real Cognito would reject
 * fails as a validation error here too, rather than as a missing user.
 */
export function requireSimCognitoUsername(
  value: string | undefined,
): SimCognitoUsername {
  if (value === undefined || value === "") {
    throw new SimCognitoInvalidParameterException(
      "Username is required: name the user the request is for",
    );
  }

  if (value.length > maxUsernameLength) {
    throw new SimCognitoInvalidParameterException(
      `Username '${value}' is longer than the ${String(maxUsernameLength)} ` +
        `characters Cognito allows`,
    );
  }

  if (!usernamePattern.test(value)) {
    throw new SimCognitoInvalidParameterException(
      `Username '${value}' contains characters Cognito does not allow: a ` +
        `username may not hold whitespace`,
    );
  }

  return value as SimCognitoUsername;
}

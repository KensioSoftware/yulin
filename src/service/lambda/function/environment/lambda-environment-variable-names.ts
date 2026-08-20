import {
  SimLambdaInvalidParameterValueException,
  SimLambdaValidationException,
} from "../../error/sim-lambda.error.js";
import { lambdaReservedVariableNames } from "./lambda-reserved-variable-names.js";

/**
 * The pattern real Lambda requires an environment variable name to match: a
 * letter, then at least one more letter, digit or underscore.
 *
 * The trailing `+` is why a single-character name is rejected too, and why
 * the reserved names starting with an underscore fail this before they ever
 * reach the reserved-name check.
 */
const variableNamePattern = /^[a-zA-Z][a-zA-Z0-9_]+$/;

/**
 * The declared names failing a check, in a stable order for reporting.
 */
function namesFailing(
  declared: ReadonlyMap<string, string>,
  fails: (name: string) => boolean,
): string[] {
  return declared
    .keys()
    .filter(fails)
    .toArray()
    .toSorted((left, right) => left.localeCompare(right));
}

/**
 * Reject variable names that break the AWS name pattern.
 */
function requireMatchingVariableNames(
  declared: ReadonlyMap<string, string>,
): void {
  const invalid = namesFailing(
    declared,
    (name) => !variableNamePattern.test(name),
  );

  if (invalid.length === 0) {
    return;
  }

  throw new SimLambdaValidationException(
    "1 validation error detected: Value at 'environment.variables' failed " +
      "to satisfy constraint: Map keys must satisfy constraint: [Member " +
      "must satisfy regular expression pattern: [a-zA-Z]([a-zA-Z0-9_])+]. " +
      `Invalid keys used in this request: ${invalid.join(", ")}`,
  );
}

/**
 * Reject reserved variable names AWS-style, naming the offenders.
 */
function requireUnreservedVariableNames(
  declared: ReadonlyMap<string, string>,
): void {
  const reserved = namesFailing(declared, (name) =>
    lambdaReservedVariableNames.has(name),
  );

  if (reserved.length === 0) {
    return;
  }

  throw new SimLambdaInvalidParameterValueException(
    "Lambda was unable to configure your environment variables because " +
      "the environment variables you have provided contains reserved keys " +
      "that are currently not supported for modification. Reserved keys " +
      `used in this request: ${reserved.join(", ")}`,
  );
}

/**
 * Validate the declared environment variable names.
 *
 * Applies AWS's two stages in its order: the API name-pattern constraint
 * first, then the service-level reserved-name rule. The order is what a
 * caller sees for a name breaking both, such as the reserved `_HANDLER`,
 * which is also an illegal name shape.
 */
export function requireValidVariableNames(
  declared: ReadonlyMap<string, string>,
): void {
  requireMatchingVariableNames(declared);
  requireUnreservedVariableNames(declared);
}

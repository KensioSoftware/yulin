import { SimSsmValidationException } from "../../error/sim-ssm.error.js";

/**
 * The most names GetParameters and DeleteParameters accept in one request.
 *
 * This is a real limit and a commonly hit one: code that reads a growing list
 * of parameters in one batch works until the eleventh is added.
 */
const maxNames = 10;

/**
 * Read the parameter names a batch request carries, or refuse.
 */
export function requireParameterNames(
  names: readonly string[] | undefined,
  operation: string,
): readonly string[] {
  if (names === undefined || names.length === 0) {
    throw new SimSsmValidationException(
      `${operation} requires at least one parameter name in Names`,
    );
  }

  if (names.length > maxNames) {
    throw new SimSsmValidationException(
      `${operation} accepts at most ${String(maxNames)} names in one ` +
        `request, and was given ${String(names.length)}`,
    );
  }

  return names;
}

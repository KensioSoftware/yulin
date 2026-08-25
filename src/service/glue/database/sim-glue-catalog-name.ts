import { SimGlueInvalidInputException } from "../error/sim-glue.error.js";

/** How long a name real Glue accepts for a database or a table. */
const maximumNameLength = 255;

/**
 * Read a database or table name, refusing one real Glue would refuse.
 *
 * Real Glue lowercases these names for Hive compatibility. This keeps the
 * name as it was given, which is recorded in the docs page's Limitations list.
 */
export function requiredSimGlueName(
  label: string,
  value: string | undefined,
): string {
  if (value === undefined || value === "") {
    throw new SimGlueInvalidInputException(`${label} is required`);
  }

  if (value.length > maximumNameLength) {
    throw new SimGlueInvalidInputException(
      `${label} must be at most ${maximumNameLength} characters`,
    );
  }

  return value;
}

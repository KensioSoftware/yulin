import { SimGlueInvalidInputException } from "../error/sim-glue.error.js";

/**
 * How long a name real Glue accepts for a database, a table or a column.
 *
 * Measured in UTF-8 bytes rather than characters, which is how the Data
 * Catalog states the limit. A 255 character name of three-byte characters is
 * three times over it.
 */
const maximumNameBytes = 255;

const nameEncoder = new TextEncoder();

/**
 * Read a Data Catalog name, refusing one real Glue would refuse.
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

  if (nameEncoder.encode(value).length > maximumNameBytes) {
    throw new SimGlueInvalidInputException(
      `${label} must be at most ${maximumNameBytes} UTF-8 bytes`,
    );
  }

  return value;
}

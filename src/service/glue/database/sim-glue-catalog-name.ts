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
 * The case is kept as it was given. Column names are read through this, and
 * they are the names real Glue leaves alone.
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

/**
 * Read a database or table name, folded the way the Data Catalog folds one.
 *
 * Real Glue states the same thing for both. `DatabaseInput.Name` and
 * `TableInput.Name` are each documented as folded to lowercase when they are
 * stored, for compatibility with Apache Hive.
 *
 * The fold is locale independent, since a Data Catalog name means the same
 * thing wherever it is read.
 *
 * https://docs.aws.amazon.com/glue/latest/webapi/API_TableInput.html
 */
export function foldedSimGlueName(
  label: string,
  value: string | undefined,
): string {
  return simGlueFolded(requiredSimGlueName(label, value));
}

/** Fold a name that has already been read. */
export function simGlueFolded(name: string): string {
  return name.toLowerCase();
}

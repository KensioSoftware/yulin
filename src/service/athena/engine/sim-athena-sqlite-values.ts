import { simAthenaIsBooleanType } from "./sim-athena-column-types.js";

/** What SQLite will take as a bound parameter. */
export type SimAthenaSqliteValue = string | number | bigint | null;

/** How delimited text writes a boolean, which JSON writes as a keyword. */
const booleanText: ReadonlyMap<string, number> = new Map([
  ["true", 1],
  ["false", 0],
  ["1", 1],
  ["0", 0],
]);

/**
 * One decoded value, as SQLite will hold it.
 *
 * SQLite has no boolean and no structured types. A boolean is stored as a whole
 * number and read back out by what the Glue column declared, and an object or
 * an array is stored as its JSON text, which is what makes
 * `json_extract_scalar` and `cardinality` reach into it.
 *
 * The Glue type is read for one reason. JSON carries a boolean as a keyword and
 * delimited text carries it as the word `true`, and a column holding the word
 * would otherwise compare against nothing and read back as `true` whichever
 * value it held.
 */
export function simAthenaSqliteValue(
  value: unknown,
  glueType: string | undefined,
): SimAthenaSqliteValue {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "string") {
    return simAthenaIsBooleanType(glueType)
      ? (booleanText.get(value.toLowerCase()) ?? null)
      : value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  return typeof value === "bigint" ? value : JSON.stringify(value);
}

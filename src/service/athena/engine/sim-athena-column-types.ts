/**
 * The type a column reports when the schema says nothing and no value in the
 * result gives it away.
 */
export const defaultAthenaResultType = "varchar";

/**
 * Hive type names, as a Glue column writes them, against the type name Athena
 * reports for the same column in a result set.
 *
 * The two vocabularies differ in three places. Hive's `string` is Athena's
 * `varchar`, Hive's `int` is Athena's `integer`, and Hive's `struct` is
 * Athena's `row`. Everything else is written the same in both.
 */
const athenaResultTypes: ReadonlyMap<string, string> = new Map([
  ["string", "varchar"],
  ["char", "varchar"],
  ["varchar", "varchar"],
  ["int", "integer"],
  ["integer", "integer"],
  ["bigint", "bigint"],
  ["tinyint", "tinyint"],
  ["smallint", "smallint"],
  ["float", "real"],
  ["double", "double"],
  ["decimal", "decimal"],
  ["boolean", "boolean"],
  ["date", "date"],
  ["timestamp", "timestamp"],
  ["binary", "varbinary"],
  ["array", "array"],
  ["map", "map"],
  ["struct", "row"],
]);

/** The types SQLite should hold as whole numbers. */
const integerTypes = new Set([
  "tinyint",
  "smallint",
  "int",
  "integer",
  "bigint",
  "boolean",
]);

/** The types SQLite should hold as floating point. */
const realTypes = new Set(["float", "double", "real", "decimal"]);

/**
 * A Hive type name with its parameters and element types taken off.
 *
 * `decimal(10,2)` and `array<struct<a:int>>` both name their kind first, and
 * that is the whole of what either mapping below needs.
 */
function baseType(glueType: string | undefined): string {
  const named = /^\s*([\dA-Za-z_]+)/u.exec(glueType ?? "");

  return (named?.[1] ?? "").toLowerCase();
}

/**
 * The SQLite column affinity a Glue column type gets.
 *
 * A boolean is held as a whole number, which is the only thing SQLite has, and
 * read back out as `true` or `false` by the type the Glue column declared.
 */
export function simAthenaSqliteAffinity(glueType: string | undefined): string {
  const type = baseType(glueType);

  if (integerTypes.has(type)) {
    return "INTEGER";
  }

  return realTypes.has(type) ? "REAL" : "TEXT";
}

/** Whether a Glue column type holds a day with no time on it. */
export function simAthenaIsDateType(glueType: string | undefined): boolean {
  return baseType(glueType) === "date";
}

/** Whether a Glue column type holds a boolean. */
export function simAthenaIsBooleanType(glueType: string | undefined): boolean {
  return baseType(glueType) === "boolean";
}

/** The type name Athena reports for a Glue column type. */
export function simAthenaResultType(glueType: string | undefined): string {
  return athenaResultTypes.get(baseType(glueType)) ?? defaultAthenaResultType;
}

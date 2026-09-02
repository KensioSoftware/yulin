// A result row is an array in the statement's own column order, so every
// read of one is by a position worked out at run time.
// oxlint-disable security/detect-object-injection
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import type { SimAthenaDeclaredColumn } from "../result/sim-athena-declared-result.js";
import { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";
import { simAthenaResultColumns } from "./sim-athena-result-columns.js";
import type { SimAthenaLoadedTable } from "./sim-athena-table-rows.js";

/**
 * Run one translated statement and read its answer back as a result set.
 *
 * The rows come back as arrays rather than as objects, because a statement is
 * free to answer with two columns of one name and an object would keep one of
 * them.
 */
export function simAthenaEngineResult(
  database: DatabaseSync,
  sql: string,
  loaded: readonly SimAthenaLoadedTable[],
): SimAthenaResolvedResult {
  const statement = database.prepare(sql);

  statement.setReturnArrays(true);

  // A whole number comes back as a BigInt, because SQLite holds a 64 bit
  // integer and reading one past what a double represents exactly raises
  // otherwise. A Parquet `bigint` column is what carries values that large.
  // Every one of them renders the same either way.
  statement.setReadBigInts(true);

  const rows = statement.all() as unknown as readonly SQLOutputValue[][];
  const columns = simAthenaResultColumns(statement.columns(), rows, loaded);

  return new SimAthenaResolvedResult({
    columns,
    rows: rows.map((row) =>
      columns.map((column, index) => rendered(row[index], column)),
    ),
  });
}

/**
 * One value as `GetQueryResults` carries it.
 *
 * A boolean column is stored as a whole number, because SQLite has nothing
 * else to store it as, and the Glue type is what says to write it back out as
 * `true` or `false`. Real Athena leaves a null out of a result row altogether
 * and this simulation has no way to say so, so a null reads as an empty
 * string.
 */
function rendered(
  value: SQLOutputValue | undefined,
  column: SimAthenaDeclaredColumn,
): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (column.type === "boolean") {
    return value === 0 || value === 0n ? "false" : "true";
  }

  if (typeof value === "string") {
    return value;
  }

  return value instanceof Uint8Array
    ? new TextDecoder().decode(value)
    : String(value);
}

// A result row is an array in the statement's own column order, so every
// read of one is by a position worked out at run time.
// oxlint-disable security/detect-object-injection
import type { SQLOutputValue, StatementColumnMetadata } from "node:sqlite";

import type { SimAthenaDeclaredColumn } from "../result/sim-athena-declared-result.js";
import {
  defaultAthenaResultType,
  simAthenaResultType,
} from "./sim-athena-column-types.js";
import type { SimAthenaLoadedTable } from "./sim-athena-table-rows.js";

/** A name a statement could have written itself, rather than one SQLite made up. */
const identifier = /^[A-Za-z_][\dA-Za-z_]*$/u;

/**
 * The columns a result set reports, named and typed as Athena names and types
 * them.
 *
 * A column SQLite traces back to a table takes that table's Glue type, which
 * is what makes a boolean read as `true` rather than as `1`. A computed column
 * has no such origin, so its type is read off the first value that is not
 * null.
 *
 * An expression nobody named is called `_col0` upward, which is what Athena
 * calls one. SQLite names it after the expression instead, and a name that
 * could not have been written as an identifier is how that is told apart from
 * an alias a statement chose.
 */
export function simAthenaResultColumns(
  metadata: readonly StatementColumnMetadata[],
  rows: readonly (readonly SQLOutputValue[])[],
  loaded: readonly SimAthenaLoadedTable[],
): readonly SimAthenaDeclaredColumn[] {
  const types = glueColumnTypes(loaded);

  return metadata.map((column, index) => ({
    name: nameOf(column, index),
    type:
      column.column === null
        ? inferredType(rows, index)
        : simAthenaResultType(types.get(originOf(column))),
  }));
}

function nameOf(column: StatementColumnMetadata, index: number): string {
  const { name } = column;

  if (column.column !== null || identifier.test(name)) {
    return name;
  }

  return `_col${String(index)}`;
}

function originOf(column: StatementColumnMetadata): string {
  return [column.database, column.table, column.column]
    .map((part) => (part ?? "").toLowerCase())
    .join(".");
}

/**
 * Every loaded column's Glue type, keyed the way SQLite reports a column's
 * origin.
 *
 * A table the query context let a statement name unqualified is held in
 * SQLite's `main` schema as well as its own, so both keys are written.
 */
function glueColumnTypes(
  loaded: readonly SimAthenaLoadedTable[],
): ReadonlyMap<string, string | undefined> {
  const types = new Map<string, string | undefined>();

  for (const one of loaded) {
    for (const column of [...one.table.columns, ...one.table.partitionKeys]) {
      const suffix = `${one.table.name}.${column.Name}`.toLowerCase();

      types.set(
        `${one.table.databaseName.toLowerCase()}.${suffix}`,
        column.Type,
      );
      types.set(`main.${suffix}`, column.Type);
    }
  }

  return types;
}

/**
 * The type a computed column reports, taken from what it answered with.
 *
 * SQLite carries no type for an expression, and a column of nulls carries no
 * value to read one off, so that falls back to `varchar` the way an
 * undeclared column does.
 */
function inferredType(
  rows: readonly (readonly SQLOutputValue[])[],
  index: number,
): string {
  for (const row of rows) {
    const value = row[index];

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "bigint") {
      return "bigint";
    }

    if (typeof value === "number") {
      return Number.isSafeInteger(value) ? "bigint" : "double";
    }

    return typeof value === "string" ? "varchar" : "varbinary";
  }

  return defaultAthenaResultType;
}

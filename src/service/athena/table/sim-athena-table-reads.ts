import type { SimAthenaQueryBlocks } from "./sim-athena-query-blocks.js";
import { simAthenaAliasAt } from "./sim-athena-read-alias.js";
import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";
import {
  simAthenaFoldedName,
  type SimAthenaTableReference,
} from "./sim-athena-table-reference.js";
import { simAthenaTableReferences } from "./sim-athena-table-references.js";

/** The table whose partitions are being read, as the catalog names it. */
export interface SimAthenaNamedTable {
  readonly name: string;
  readonly databaseName: string;
}

/** The values each column is pinned to, by lower-cased column name. */
export type SimAthenaColumnValues = Map<string, readonly string[]>;

/** One place the query reads the table, and the name its filters use. */
export interface SimAthenaTableRead {
  readonly block: number;

  /** The alias, or the table's own name where it has none. */
  readonly name: string;

  /** The database an unaliased reference names, where it names one. */
  readonly database: string | undefined;
}

/**
 * Every place the query reads this table.
 *
 * A reference matches on its name, and on its database where it names one.
 * An unqualified name could belong to another database, and matching it
 * anyway only widens the read.
 */
export function simAthenaTableReads(
  sql: string,
  tokens: readonly SimAthenaSqlToken[],
  blocks: SimAthenaQueryBlocks,
  table: SimAthenaNamedTable,
): readonly SimAthenaTableRead[] {
  const name = simAthenaFoldedName(table.name);
  const database = simAthenaFoldedName(table.databaseName);
  const matching = simAthenaTableReferences(sql).references.filter(
    (reference) =>
      simAthenaFoldedName(reference.name) === name &&
      (reference.database === undefined ||
        simAthenaFoldedName(reference.database) === database),
  );

  // A reference's index is the index of the token its name starts at, read
  // from the same tokens.
  return matching.map((reference) => {
    const position = tokens.findIndex(
      (token) => token.index === reference.index,
    );

    const alias = simAthenaAliasAt(
      tokens,
      position + 2 * partCount(reference) - 1,
    );

    return {
      block: blocks.blockOf.at(position) ?? 0,
      name: alias ?? name,
      database:
        alias === undefined && reference.database !== undefined
          ? simAthenaFoldedName(reference.database)
          : undefined,
    };
  });
}

/** How many dot-separated parts a reference names. */
function partCount(reference: SimAthenaTableReference): number {
  return [reference.catalog, reference.database, reference.name].filter(
    (part) => part !== undefined,
  ).length;
}

/**
 * Everything any one read asks for.
 *
 * A column stays constrained only where every read constrains it. With no
 * read found, nothing is constrained.
 */
export function simAthenaUnionOfReads(
  reads: readonly SimAthenaColumnValues[],
): SimAthenaColumnValues {
  const byColumn: SimAthenaColumnValues = new Map();
  const columns = [...(reads.at(0)?.keys() ?? [])];

  for (const name of columns) {
    const perRead = reads.map((read) => read.get(name));

    if (perRead.every((values) => values !== undefined)) {
      byColumn.set(name, [...new Set(perRead.flat())]);
    }
  }

  return byColumn;
}

/**
 * Add one constraint, keeping only what it and any earlier one agree on.
 */
export function simAthenaNarrow(
  byColumn: SimAthenaColumnValues,
  columnName: string,
  values: readonly string[],
): void {
  const name = columnName.toLowerCase();
  const already = byColumn.get(name);

  if (already === undefined) {
    byColumn.set(name, values);

    return;
  }

  const wanted = new Set(values);

  byColumn.set(
    name,
    already.filter((value) => wanted.has(value)),
  );
}

import type { SimAthenaQueryBlocks } from "./sim-athena-query-blocks.js";
import type { SimAthenaQualifier } from "./sim-athena-read-alias.js";
import {
  simAthenaNarrow,
  type SimAthenaColumnValues,
  type SimAthenaTableRead,
} from "./sim-athena-table-reads.js";

/** One `column = 'value'` or `column IN (...)`, and the name it qualifies. */
export interface SimAthenaColumnFilter {
  readonly column: string;
  readonly qualifier: SimAthenaQualifier | undefined;
  readonly values: readonly string[];
}

/**
 * The filters on one read of a table, from its own `SELECT` and from every
 * query a subquery in `FROM` sits in.
 *
 * A qualified filter narrows the read only where its qualifier names it. In
 * the read's own `SELECT` that is the read's alias, or the table's name where
 * it has none. Further out it is the alias of the subquery holding the read.
 * A qualifier naming a database (`db.t.day`) also needs the read to name that
 * database. A qualifier naming anything else (another table, another alias of
 * this one, a row column) leaves the read as wide as it was.
 */
export function simAthenaReadFilters(
  byBlock: ReadonlyMap<number, readonly SimAthenaColumnFilter[]>,
  blocks: SimAthenaQueryBlocks,
  read: SimAthenaTableRead,
): SimAthenaColumnValues {
  const byColumn: SimAthenaColumnValues = new Map();
  let cursor: number | undefined = read.block;
  let named: SimAthenaQualifier | undefined = read;

  while (cursor !== undefined) {
    const filters = byBlock.get(cursor) ?? [];

    for (const filter of filters) {
      if (names(filter.qualifier, named)) {
        simAthenaNarrow(byColumn, filter.column, filter.values);
      }
    }

    const alias = blocks.aliasOf.get(cursor);

    named =
      alias === undefined ? undefined : { name: alias, database: undefined };
    cursor = blocks.outerOf.get(cursor);
  }

  return byColumn;
}

/** Whether a filter's qualifier, where it has one, names this read. */
function names(
  qualifier: SimAthenaQualifier | undefined,
  read: SimAthenaQualifier | undefined,
): boolean {
  if (qualifier === undefined) {
    return true;
  }

  return (
    qualifier.name === read?.name &&
    (qualifier.database === undefined || qualifier.database === read.database)
  );
}

import { simAthenaComparedValues } from "./sim-athena-compared-values.js";
import { simAthenaDisjunctivePositions } from "./sim-athena-disjunctive-positions.js";
import { simAthenaFilteringPositions } from "./sim-athena-filtering-positions.js";
import { simAthenaNegatedColumns } from "./sim-athena-negated-columns.js";
import {
  simAthenaQueryBlocks,
  type SimAthenaQueryBlocks,
} from "./sim-athena-query-blocks.js";
import {
  simAthenaSqlTokens,
  type SimAthenaSqlToken,
} from "./sim-athena-sql-tokens.js";
import {
  simAthenaNarrow,
  simAthenaReadFilters,
  simAthenaTableReadBlocks,
  simAthenaUnionOfReads,
  type SimAthenaColumnValues,
  type SimAthenaNamedTable,
} from "./sim-athena-table-reads.js";

export type { SimAthenaNamedTable } from "./sim-athena-table-reads.js";

/**
 * The partition values a query pins down for one table.
 *
 * Only two shapes are read, `column = 'value'` and `column IN ('a', 'b')`, and
 * only in a `WHERE` or an `ON` clause, outside any `CASE` and any function's
 * arguments. A comparison in the select list picks a value out of each row
 * and leaves every row in. An `OR` leaves unread everything inside
 * the brackets it sits in (the whole `SELECT`, outside any brackets). A value
 * under one arm constrains nothing on its own. A value beside the brackets,
 * joined to them by `AND`, still constrains the rows the query reads.
 *
 * A `NOT` leaves the columns it reaches unconstrained in its own `SELECT`. A
 * negated value names the partition the query does not want, and reading it as
 * a constraint would answer from the wrong prefixes. A negation on any other
 * column leaves the partition constraints as true as they were.
 *
 * Two constraints on one column in one `SELECT` are intersected, since a
 * query carrying both wants the rows they agree on.
 *
 * A filter constrains only the reads of its own `SELECT`, and the reads inside
 * a subquery in that `SELECT`'s `FROM`. A table read more than once (in a
 * subquery, a `UNION` or a common table expression) reads the union of what
 * each read asks for. One read with no filter on a column reads every value
 * of it.
 *
 * Not reading a filter is always safe. It leaves every projected partition in,
 * which is the answer a query with no filter gets anyway.
 */
export class SimAthenaPartitionFilters {
  readonly #byColumn: ReadonlyMap<string, readonly string[]>;

  constructor(byColumn: ReadonlyMap<string, readonly string[]>) {
    this.#byColumn = byColumn;
  }

  /** The values this query pins one column to, where it pins any. */
  valuesFor(columnName: string): readonly string[] | undefined {
    return this.#byColumn.get(columnName.toLowerCase());
  }
}

/**
 * Read the partition filters one query puts on one table.
 */
export function simAthenaPartitionFilters(
  sql: string,
  table: SimAthenaNamedTable,
): SimAthenaPartitionFilters {
  const tokens = simAthenaSqlTokens(sql);

  if (tokens === undefined) {
    return new SimAthenaPartitionFilters(new Map());
  }

  const blocks = simAthenaQueryBlocks(tokens);
  const byBlock = blockFilters(tokens, blocks);
  const reads = simAthenaTableReadBlocks(sql, tokens, blocks, table).map(
    (block) => simAthenaReadFilters(byBlock, blocks, block),
  );

  return new SimAthenaPartitionFilters(simAthenaUnionOfReads(reads));
}

/** The filters each `SELECT` puts on the tables it reads directly. */
function blockFilters(
  tokens: readonly SimAthenaSqlToken[],
  blocks: SimAthenaQueryBlocks,
): ReadonlyMap<number, SimAthenaColumnValues> {
  const byBlock = new Map<number, SimAthenaColumnValues>();
  const filtering = simAthenaFilteringPositions(tokens);
  const disjunctive = simAthenaDisjunctivePositions(tokens);

  for (const [position, token] of tokens.entries()) {
    if (token.kind !== "word" && token.kind !== "quoted") {
      continue;
    }

    if (!filtering.has(position) || disjunctive.has(position)) {
      continue;
    }

    const values = simAthenaComparedValues(tokens, position);

    if (values === undefined) {
      continue;
    }

    const block = blocks.blockOf.at(position) ?? 0;
    const byColumn: SimAthenaColumnValues = byBlock.get(block) ?? new Map();

    simAthenaNarrow(byColumn, token.text, values);
    byBlock.set(block, byColumn);
  }

  for (const { name, position } of simAthenaNegatedColumns(tokens)) {
    byBlock.get(blocks.blockOf.at(position) ?? 0)?.delete(name);
  }

  return byBlock;
}

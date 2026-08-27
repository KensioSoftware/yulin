import { simAthenaNegatedColumns } from "./sim-athena-negated-columns.js";
import { simAthenaSqlTokens } from "./sim-athena-sql-tokens.js";

/**
 * The partition values a query's `WHERE` clause pins down.
 *
 * Only two shapes are read, `column = 'value'` and `column IN ('a', 'b')`, and
 * they are read wherever they appear. A query carrying `OR` anywhere is left
 * unfiltered, since a value under one arm constrains nothing on its own.
 *
 * A `NOT` leaves the columns it reaches unconstrained and the rest alone. A
 * negated value names the partition the query does not want, and reading it as
 * a constraint would answer from the wrong prefixes. A negation on any other
 * column leaves the partition constraints as true as they were.
 *
 * Two constraints on one column are intersected, since a query carrying both
 * wants the rows they agree on.
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
 * Read the partition filters out of one query.
 */
export function simAthenaPartitionFilters(
  sql: string,
): SimAthenaPartitionFilters {
  const tokens = simAthenaSqlTokens(sql);
  const byColumn = new Map<string, readonly string[]>();

  if (tokens === undefined || tokens.some(isUnreadableTerm)) {
    return new SimAthenaPartitionFilters(byColumn);
  }

  for (const [position, token] of tokens.entries()) {
    if (token.kind !== "word" && token.kind !== "quoted") {
      continue;
    }

    const operator = tokens.at(position + 1);

    if (operator?.kind === "symbol" && operator.text === "=") {
      const value = tokens.at(position + 2);

      if (value?.kind === "literal") {
        narrow(byColumn, token.text, [value.text]);
      }

      continue;
    }

    if (operator?.kind === "word" && operator.text === "in") {
      const values = literalList(tokens, position + 2);

      if (values !== undefined) {
        narrow(byColumn, token.text, values);
      }
    }
  }

  for (const name of simAthenaNegatedColumns(tokens)) {
    byColumn.delete(name);
  }

  return new SimAthenaPartitionFilters(byColumn);
}

/**
 * Add one constraint, keeping only what it and any earlier one agree on.
 */
function narrow(
  byColumn: Map<string, readonly string[]>,
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

function isUnreadableTerm(token: { kind: string; text: string }): boolean {
  return token.kind === "word" && token.text === "or";
}

/**
 * Read `('a', 'b')` starting at its opening bracket.
 *
 * Anything else in the brackets, such as a subquery, answers with nothing and
 * leaves the column unfiltered.
 */
function literalList(
  tokens: readonly { kind: string; text: string }[],
  start: number,
): readonly string[] | undefined {
  if (tokens.at(start)?.text !== "(") {
    return undefined;
  }

  const values: string[] = [];
  let cursor = start + 1;

  while (cursor < tokens.length) {
    const value = tokens.at(cursor);

    if (value?.kind !== "literal") {
      return undefined;
    }

    values.push(value.text);
    cursor += 1;

    const separator = tokens.at(cursor);

    if (separator?.text === ")") {
      return values;
    }

    if (separator?.text !== ",") {
      return undefined;
    }

    cursor += 1;
  }

  return undefined;
}

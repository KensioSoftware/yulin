import {
  isColumnRef,
  simAthenaAstNodes,
  type SimAthenaAstNode,
} from "./sim-athena-ast-nodes.js";

/**
 * Why Athena refuses one parsed statement, where it does.
 *
 * Everything here is a statement SQLite runs happily and the real service
 * rejects. A translation that hands such a statement to SQLite answers a test
 * with rows, and the command then fails against AWS. Each shape is spotted on
 * the tree the Athena grammar produced, before anything is written out for
 * SQLite.
 *
 * Trino and SQLite resolve names by different rules in more places than this.
 * One shape is covered, the one seen reaching production. Add the next when a
 * query hits it.
 */
export function simAthenaRejectedStatement(ast: unknown): string | undefined {
  for (const node of simAthenaAstNodes(ast)) {
    const sort = node["orderby"];
    const columns = node["columns"];

    if (!Array.isArray(sort) || !Array.isArray(columns)) {
      continue;
    }

    const alias = aggregatedAlias(sort, columns);

    if (alias !== undefined) {
      return orderByAggregateOverAlias(alias);
    }
  }

  return undefined;
}

/** What Athena says about an `ORDER BY` aggregate over an aggregate alias. */
function orderByAggregateOverAlias(alias: string): string {
  return (
    `Athena refuses this statement. Its ORDER BY aggregates over ${alias}, ` +
    `and the select list names ${alias} as the output alias of an aggregate. ` +
    `Trino resolves a bare name in ORDER BY against the select list before ` +
    `the table. That makes the sort an aggregate over an aggregate, and the ` +
    `service answers "Invalid reference to output projection attribute from ` +
    `ORDER BY aggregation". Sort by ${alias} on its own, or give the alias a ` +
    `name the sort leaves alone.`
  );
}

/**
 * The output alias one `ORDER BY` aggregates over, where the alias aggregates
 * too.
 *
 * A select list of `sum(qty) AS qty` sorted by `ORDER BY sum(qty)` is the
 * shape. SQLite reads that `qty` as the table's column and sorts correctly.
 * Trino reads it as the alias and refuses the query.
 *
 * `ORDER BY qty` over the same select list is the form Athena takes, with no
 * aggregate wrapped around the name. An aggregate over a name the select list
 * leaves alone is legal too, as in `ORDER BY sum(revenue_total)` beside
 * `coalesce(sum(revenue_total), 0) AS revenue`. The aliases are what tell this
 * shape from those two.
 */
function aggregatedAlias(
  sort: readonly unknown[],
  columns: readonly SimAthenaAstNode[],
): string | undefined {
  const aliases = aggregateAliases(columns);

  if (aliases.size === 0) {
    return undefined;
  }

  for (const node of simAthenaAstNodes(sort)) {
    if (!isAggregate(node)) {
      continue;
    }

    const arguments_ = simAthenaAstNodes(node["args"]);

    for (const inner of arguments_) {
      const alias =
        isColumnRef(inner) && inner.table === null
          ? aliases.get(inner.column.toLowerCase())
          : undefined;

      if (alias !== undefined) {
        return alias;
      }
    }
  }

  return undefined;
}

/** Every output alias of one select list whose own expression aggregates. */
function aggregateAliases(
  columns: readonly SimAthenaAstNode[],
): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const column of columns) {
    const alias = column["as"];

    if (typeof alias === "string" && holdsAggregate(column["expr"])) {
      aliases.set(alias.toLowerCase(), alias);
    }
  }

  return aliases;
}

/** Whether anything under this expression aggregates. */
function holdsAggregate(expression: unknown): boolean {
  for (const node of simAthenaAstNodes(expression)) {
    if (isAggregate(node)) {
      return true;
    }
  }

  return false;
}

/**
 * Whether this node is a grouped aggregate call.
 *
 * A window function carries `over` and is computed once the grouped aggregates
 * have been. It takes an output alias in `ORDER BY` happily, and stays out of
 * this.
 */
function isAggregate(node: SimAthenaAstNode): boolean {
  return node["type"] === "aggr_func" && (node["over"] ?? null) === null;
}

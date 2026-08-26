import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import {
  isColumnRef,
  replaceNode,
  simAthenaAstNodes,
  type SimAthenaAstNode,
} from "./sim-athena-ast-nodes.js";
import { simAthenaRewriteUnnestColumns } from "./sim-athena-unnest-columns.js";
import { simAthenaUnnestItem } from "./sim-athena-unnest-item.js";
import {
  simAthenaQueryTables,
  simAthenaUnnestKind,
} from "./sim-athena-unnest-source.js";
import { simAthenaUnnestTargets } from "./sim-athena-unnest-targets.js";

interface SimAthenaUnnestRewriteRequest {
  readonly ast: unknown;
  readonly ordinality: boolean;
  readonly tables: readonly SimAthenaCatalogTable[];
}

/**
 * Turn an `UNNEST` into the `json_each` SQLite flattens JSON with.
 *
 * An array or a map column is held as its JSON text, and `json_each` reads that
 * as one row per element with a `key` and a `value`. The `FROM` entry becomes a
 * call to it and every reference to the alias is pointed at the column it
 * answers with.
 *
 * Answers with whether the statement can run. A statement carrying no `UNNEST`
 * runs untouched, and one carrying an `UNNEST` this cannot turn into
 * `json_each` is left for the declared result to answer.
 */
export function simAthenaRewriteUnnest(
  request: SimAthenaUnnestRewriteRequest,
): boolean {
  const read = simAthenaUnnestItem(request.ast);

  if (read.kind !== "found") {
    return read.kind === "absent";
  }

  const kind = simAthenaUnnestKind(read.source, request.ast, request.tables);
  const targets =
    kind === undefined
      ? undefined
      : simAthenaUnnestTargets(kind, read.columns, request.ordinality);

  if (targets === undefined || selectsEverything(request.ast)) {
    return false;
  }

  const source = { ...read.source };

  replaceNode(read.item, {
    expr: {
      type: "function",
      name: { name: [{ type: "default", value: "json_each" }] },
      args: { type: "expr_list", value: [source] },
    },
    as: read.alias,
  });

  simAthenaRewriteUnnestColumns({
    ast: request.ast,
    alias: read.alias,
    targets,
    reachable: simAthenaQueryTables(request.ast, request.tables),
  });

  return true;
}

/**
 * Whether the statement selects every column.
 *
 * `json_each` answers with eight columns of its own, and a `SELECT *` beside it
 * would report all of them where Athena reports the flattened one. A result set
 * carrying columns that were never asked for is worse than falling back.
 */
function selectsEverything(ast: unknown): boolean {
  return [...simAthenaAstNodes(ast)].some(
    (node: SimAthenaAstNode) => isColumnRef(node) && node.column === "*",
  );
}

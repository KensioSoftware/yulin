import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import {
  isColumnRef,
  replaceNode,
  simAthenaAstNodes,
  type SimAthenaAstNode,
  type SimAthenaColumnRef,
} from "./sim-athena-ast-nodes.js";
import type { SimAthenaUnnestTarget } from "./sim-athena-unnest-targets.js";

interface SimAthenaUnnestColumnsRequest {
  readonly ast: unknown;
  readonly alias: string;
  readonly targets: readonly SimAthenaUnnestTarget[];
  readonly reachable: ReadonlyMap<string, SimAthenaCatalogTable>;
}

/**
 * Point every reference to an `UNNEST` alias at the column `json_each` answers
 * with.
 *
 * A qualified reference is unambiguous and is always rewritten. An unqualified
 * one is rewritten only where no table the statement reads declares a column of
 * that name, since a statement writing one where both could answer is
 * ambiguous on real Athena.
 */
export function simAthenaRewriteUnnestColumns(
  request: SimAthenaUnnestColumnsRequest,
): void {
  const alias = request.alias.toLowerCase();
  const matched: { node: SimAthenaAstNode; target: SimAthenaUnnestTarget }[] =
    [];

  // Every match is collected before any of them is rewritten. Reading the
  // position writes a `key` of its own into the tree, and a walk still running
  // would find that and read it as another reference to the alias.
  for (const node of simAthenaAstNodes(request.ast)) {
    const target = matchedTarget(node, alias, request);

    if (target !== undefined) {
      matched.push({ node, target });
    }
  }

  for (const { node, target } of matched) {
    nameSelectedColumn(node, request.ast);
    readColumn(node, request.alias, target);
  }
}

function matchedTarget(
  node: SimAthenaAstNode,
  alias: string,
  request: SimAthenaUnnestColumnsRequest,
): SimAthenaUnnestTarget | undefined {
  if (!isColumnRef(node)) {
    return undefined;
  }

  const qualifier = node.table?.toLowerCase();

  if (qualifier !== undefined && qualifier !== alias) {
    return undefined;
  }

  const target = request.targets.find(
    (one) => one.from.toLowerCase() === node.column.toLowerCase(),
  );

  if (target === undefined || qualifier === alias) {
    return target;
  }

  return declaredElsewhere(node.column, request.reachable) ? undefined : target;
}

/** Whether a table the statement reads carries a column of this name. */
function declaredElsewhere(
  column: string,
  reachable: ReadonlyMap<string, SimAthenaCatalogTable>,
): boolean {
  return reachable
    .values()
    .some((table) =>
      table.columns.some(
        (one) => one.Name.toLowerCase() === column.toLowerCase(),
      ),
    );
}

/**
 * Keep the name a selected column had.
 *
 * `SELECT t.tag` reads `t.value` once this is done, and the result set would
 * report the column as `value`. Athena reports it as `tag`, so the name the
 * statement wrote becomes the alias.
 */
function nameSelectedColumn(node: SimAthenaAstNode, ast: unknown): void {
  for (const item of simAthenaAstNodes(ast)) {
    if (
      item["type"] === "expr" &&
      item["expr"] === node &&
      item["as"] === null
    ) {
      item["as"] = (node as SimAthenaColumnRef).column;
    }
  }
}

/** Read the `json_each` column, or the position Athena counts from one. */
function readColumn(
  node: SimAthenaAstNode,
  alias: string,
  target: SimAthenaUnnestTarget,
): void {
  if (target.reads !== "ordinality") {
    replaceNode(node, {
      type: "column_ref",
      table: alias,
      column: target.reads,
      collate: null,
    });

    return;
  }

  replaceNode(node, {
    type: "binary_expr",
    operator: "+",
    parentheses: true,
    left: { type: "column_ref", table: alias, column: "key", collate: null },
    right: { type: "number", value: 1 },
  });
}

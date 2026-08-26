/**
 * One node of the parser's syntax tree, as far as the engine reads it.
 *
 * The tree is the library's own and carries a node shape per dialect and per
 * construct. Only the handful of properties the `UNNEST` rewrite needs are
 * named, and everything else travels as an unknown value.
 */
export type SimAthenaAstNode = Record<string, unknown>;

/** A reference to a column, qualified by a table or an alias where it has one. */
export interface SimAthenaColumnRef extends SimAthenaAstNode {
  type: "column_ref";
  table: string | null;
  column: string;
}

/** One entry of a `FROM` clause naming a catalog table. */
export interface SimAthenaFromItem extends SimAthenaAstNode {
  db?: string | null;
  table: string;
  as?: string | null;
}

/** Every node in the tree, the outermost first. */
export function* simAthenaAstNodes(root: unknown): Generator<SimAthenaAstNode> {
  if (Array.isArray(root)) {
    for (const item of root) {
      yield* simAthenaAstNodes(item);
    }

    return;
  }

  if (root === null || typeof root !== "object") {
    return;
  }

  yield root as SimAthenaAstNode;

  for (const value of Object.values(root)) {
    yield* simAthenaAstNodes(value);
  }
}

/** Whether this node references a column. */
export function isColumnRef(
  node: SimAthenaAstNode,
): node is SimAthenaColumnRef {
  return node["type"] === "column_ref" && typeof node["column"] === "string";
}

/**
 * Whether this node names a catalog table in a `FROM` clause.
 *
 * A column reference carries a `table` of its own, and having no `column` is
 * what tells the two apart.
 */
export function isFromItem(node: SimAthenaAstNode): node is SimAthenaFromItem {
  return typeof node["table"] === "string" && node["column"] === undefined;
}

/** Replace everything one node holds, keeping the object the tree points at. */
export function replaceNode(
  node: SimAthenaAstNode,
  replacement: SimAthenaAstNode,
): void {
  for (const key of Object.keys(node)) {
    Reflect.deleteProperty(node, key);
  }

  Object.assign(node, replacement);
}

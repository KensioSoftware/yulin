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

/** One value as a node, or nothing where it is not an object. */
export function asAstNode(value: unknown): SimAthenaAstNode | undefined {
  return typeof value === "object" && value !== null
    ? (value as SimAthenaAstNode)
    : undefined;
}

/**
 * The name a call carries, where the statement wrote it as one part.
 *
 * The parser holds a name as a list, one entry per piece of a qualified name,
 * and it holds an `UNNEST` alias as a call of its own. A name written in more
 * than one part answers with nothing, since neither the engine's functions nor
 * an alias is reached that way.
 */
export function simAthenaCalledName(
  node: SimAthenaAstNode | undefined,
): string | undefined {
  const parts = asAstNode(node?.["name"])?.["name"];
  const first =
    Array.isArray(parts) && parts.length === 1
      ? asAstNode(parts[0])
      : undefined;
  const name = first?.["value"];

  return typeof name === "string" ? name : undefined;
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

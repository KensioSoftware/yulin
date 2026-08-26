import {
  simAthenaAstNodes,
  type SimAthenaAstNode,
} from "./sim-athena-ast-nodes.js";

/** The one `UNNEST` a statement carries, read off the tree. */
export interface SimAthenaUnnestItem {
  /** The `FROM` entry itself, which the rewrite replaces in place. */
  readonly item: SimAthenaAstNode;

  /** The name the flattened rows are reached through. */
  readonly alias: string;

  /** The names the alias gives the flattened columns, in order. */
  readonly columns: readonly string[];

  /** What is being flattened. */
  readonly source: SimAthenaAstNode;
}

/** What looking for an `UNNEST` came to. */
export type SimAthenaUnnestRead =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable" }
  | ({ readonly kind: "found" } & SimAthenaUnnestItem);

/**
 * The `UNNEST` a statement flattens an array or a map with.
 *
 * A statement carrying more than one is reported unreadable, along with one
 * whose `UNNEST` is joined any way other than a cross join and one that leaves
 * the flattened columns unnamed. Each of those runs under real Athena and none
 * of them survives the rewrite, so the query falls back to its declared result
 * rather than answering differently.
 */
export function simAthenaUnnestItem(ast: unknown): SimAthenaUnnestRead {
  const items = [...simAthenaAstNodes(ast)].filter(
    (node) => node["type"] === "unnest",
  );

  if (items.length === 0) {
    return { kind: "absent" };
  }

  const item = items[0];

  if (item === undefined || items.length > 1 || !isCrossJoined(item)) {
    return { kind: "unreadable" };
  }

  const alias = aliasOf(item);
  const columns = aliasColumns(item);
  const source = item["expr"];

  if (alias === undefined || columns === undefined || !isNode(source)) {
    return { kind: "unreadable" };
  }

  return { kind: "found", item, alias, columns, source };
}

/**
 * Whether this `UNNEST` is cross joined.
 *
 * SQLite reads a comma in a `FROM` clause as a cross join and has no other way
 * to reach a table valued function, so an `UNNEST` under a `LEFT JOIN` would
 * come out meaning something else.
 */
const crossJoins = new Set([undefined, null, "CROSS JOIN"]);

function isCrossJoined(item: SimAthenaAstNode): boolean {
  return crossJoins.has(item["join"] as string | null | undefined);
}

/** The alias name, which the parser holds as a function's name. */
function aliasOf(item: SimAthenaAstNode): string | undefined {
  const parts = asNode(asNode(item["as"])?.["name"])?.["name"];
  const first = Array.isArray(parts) ? asNode(parts[0]) : undefined;
  const value = first?.["value"];

  return typeof value === "string" ? value : undefined;
}

/** The names inside the alias, which the parser holds as a function's arguments. */
function aliasColumns(item: SimAthenaAstNode): readonly string[] | undefined {
  const values = asNode(asNode(item["as"])?.["args"])?.["value"];

  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }

  const columns = values.map((value) => asNode(value)?.["column"]);

  return columns.every((column) => typeof column === "string")
    ? columns
    : undefined;
}

function isNode(value: unknown): value is SimAthenaAstNode {
  return typeof value === "object" && value !== null;
}

function asNode(value: unknown): SimAthenaAstNode | undefined {
  return isNode(value) ? value : undefined;
}

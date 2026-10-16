import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import {
  asAstNode,
  isColumnRef,
  replaceNode,
  simAthenaAstNodes,
  simAthenaCalledName,
  type SimAthenaAstNode,
} from "./sim-athena-ast-nodes.js";

/**
 * The shims a cast to `DATE` and to `TIMESTAMP` are handed to.
 *
 * The names have the simulator's prefix so that neither can collide with a
 * Trino function a statement calls itself.
 */
export const simAthenaDateCast = "sim_athena_cast_date";
export const simAthenaTimestampCast = "sim_athena_cast_timestamp";

/** The second argument a shim is handed where the value it casts is text. */
export const simAthenaCastSource = "varchar";

/** The shim each cast target goes to. */
const castShims: ReadonlyMap<string, string> = new Map([
  ["DATE", simAthenaDateCast],
  ["TIMESTAMP", simAthenaTimestampCast],
]);

/** The Glue types a column of text is declared with. */
const textTypes = /^(?:string|varchar|char)\b/iu;

/**
 * Hand every cast to `DATE` or `TIMESTAMP` in the tree to the engine's shims.
 *
 * SQLite gives a column declared `DATE` or `TIMESTAMP` numeric affinity, so a
 * plain `CAST('2026-08-15' AS DATE)` keeps the leading number and answers
 * `2026`. Every date function downstream of that cast then reads a year where
 * it expected a date.
 *
 * Trino's one-argument `date(x)` is the cast to `DATE` under another name,
 * and it goes to the same shim. SQLite's own `date()` answers null over text
 * that is no date, where Trino fails the cast.
 *
 * Trino reads text more strictly than a value already typed as a timestamp,
 * and the shim is told which it has. A string literal and a column the catalog
 * declares as text are text. Anything else is taken to be a date or a
 * timestamp already, since the engine cannot tell the type a function answers
 * with.
 */
export function simAthenaRewriteCasts(
  ast: unknown,
  tables: readonly SimAthenaCatalogTable[],
): void {
  const textColumns = textColumnsOf(tables);

  for (const node of simAthenaAstNodes(ast)) {
    const cast = castOf(node);

    if (cast !== undefined) {
      replaceNode(node, {
        type: "function",
        name: { name: [{ type: "default", value: cast.shim }] },
        args: {
          type: "expr_list",
          value: [cast.value, sourceOf(cast.value, textColumns)],
        },
        over: null,
      });
    }
  }
}

/** One cast in the tree: the shim it goes to and the value it casts. */
interface SimAthenaCast {
  readonly shim: string;
  readonly value: unknown;
}

function castOf(node: SimAthenaAstNode): SimAthenaCast | undefined {
  if (node["type"] === "cast") {
    const shim = castShims.get(targetOf(node["target"]));

    return shim === undefined ? undefined : { shim, value: node["expr"] };
  }

  const values = asAstNode(node["args"])?.["value"];

  if (
    node["type"] !== "function" ||
    simAthenaCalledName(node)?.toLowerCase() !== "date" ||
    !Array.isArray(values) ||
    values.length !== 1
  ) {
    return undefined;
  }

  return { shim: simAthenaDateCast, value: values[0] };
}

/** The one type a cast names, upper cased, or nothing for anything else. */
function targetOf(target: unknown): string {
  const only: unknown =
    Array.isArray(target) && target.length === 1 ? target[0] : null;
  const dataType = asAstNode(only)?.["dataType"];

  return typeof dataType === "string" ? dataType.toUpperCase() : "";
}

/** The second argument that tells the shim whether its value is text. */
function sourceOf(
  value: unknown,
  textColumns: ReadonlySet<string>,
): SimAthenaAstNode {
  const node = asAstNode(value);
  const isText =
    node?.["type"] === "single_quote_string" ||
    (node !== undefined &&
      isColumnRef(node) &&
      textColumns.has(node.column.toLowerCase()));

  return {
    type: "single_quote_string",
    value: isText ? simAthenaCastSource : "",
  };
}

/**
 * Every column name the tables declare as text and as nothing else.
 *
 * A name two tables declare with different types is left out, since the
 * statement could mean either and only text is held to the stricter read.
 */
function textColumnsOf(
  tables: readonly SimAthenaCatalogTable[],
): ReadonlySet<string> {
  const text = new Set<string>();
  const other = new Set<string>();

  for (const table of tables) {
    for (const column of [...table.columns, ...table.partitionKeys]) {
      const name = column.Name.toLowerCase();

      if (textTypes.test(column.Type ?? "")) {
        text.add(name);
      } else {
        other.add(name);
      }
    }
  }

  return text.difference(other);
}

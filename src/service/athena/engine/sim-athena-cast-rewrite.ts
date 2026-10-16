import {
  asAstNode,
  replaceNode,
  simAthenaAstNodes,
  simAthenaCalledName,
  type SimAthenaAstNode,
} from "./sim-athena-ast-nodes.js";

/**
 * The shim a `CAST(... AS DATE)` is handed to.
 *
 * The name has the simulator's prefix so that it cannot collide with a Trino
 * function a statement calls itself.
 */
export const simAthenaDateCast = "sim_athena_cast_date";

/**
 * Hand every cast to `DATE` in the tree to the engine's own shim.
 *
 * SQLite gives a column declared `DATE` numeric affinity, so a plain
 * `CAST('2026-08-15' AS DATE)` keeps the leading number and answers `2026`.
 * Every date function downstream of that cast then reads a year where it
 * expected a date.
 *
 * Trino's one-argument `date(x)` is the same cast under another name, and it
 * goes to the same shim. SQLite's own `date()` answers null over text that is
 * no date, where Trino fails the cast.
 */
export function simAthenaRewriteCasts(ast: unknown): void {
  for (const node of simAthenaAstNodes(ast)) {
    const cast = castToDate(node);

    if (cast !== undefined) {
      replaceNode(node, {
        type: "function",
        name: { name: [{ type: "default", value: simAthenaDateCast }] },
        args: { type: "expr_list", value: [cast] },
        over: null,
      });
    }
  }
}

/** The expression this node casts to `DATE`, where it casts one. */
function castToDate(node: SimAthenaAstNode): unknown {
  if (node["type"] === "cast") {
    return isDateTarget(node["target"]) ? node["expr"] : undefined;
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

  return values[0];
}

/** Whether a cast's target is `DATE` alone. */
function isDateTarget(target: unknown): boolean {
  const only: unknown =
    Array.isArray(target) && target.length === 1 ? target[0] : null;
  const dataType = asAstNode(only)?.["dataType"];

  return typeof dataType === "string" && dataType.toUpperCase() === "DATE";
}

import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import {
  isColumnRef,
  isFromItem,
  simAthenaAstNodes,
  simAthenaCalledName,
  type SimAthenaAstNode,
} from "./sim-athena-ast-nodes.js";

/** The two things Athena flattens with `UNNEST`. */
export type SimAthenaUnnestKind = "array" | "map";

/**
 * The engine's own functions that answer an array.
 *
 * An expression has no catalog entry to read, so the call itself is what says
 * the value is a collection. Each of these answers with the JSON text an array
 * column is held as, which is what `json_each` reads.
 */
const arrayFunctions = new Set(["split", "slice"]);

/**
 * What the statement is flattening.
 *
 * A column is read off the Glue schema. The catalog is the only thing that says
 * whether a column holds an array, a map or a scalar, and `json_each` answers
 * with different columns for the first two. A column the schema calls anything
 * else answers with nothing here, and the query falls back rather than reading
 * a value as a collection it never was.
 *
 * An expression is read off the function it calls. `UNNEST(split(x, ','))` is
 * how a statement flattens a delimited string, and nothing but the call says
 * what it comes to. A call to anything else answers with nothing, since the
 * flattening would otherwise run over whatever SQLite made of a scalar.
 */
export function simAthenaUnnestKind(
  source: SimAthenaAstNode,
  ast: unknown,
  tables: readonly SimAthenaCatalogTable[],
): SimAthenaUnnestKind | undefined {
  if (!isColumnRef(source)) {
    return answersArray(source) ? "array" : undefined;
  }

  const declared = declaredType(source, ast, tables);

  if (declared === undefined) {
    return undefined;
  }

  const type = declared.toLowerCase();

  if (type.startsWith("array")) {
    return "array";
  }

  return type.startsWith("map") ? "map" : undefined;
}

/** Whether this expression is a call to a function answering an array. */
function answersArray(source: SimAthenaAstNode): boolean {
  const name =
    source["type"] === "function" ? simAthenaCalledName(source) : undefined;

  return name !== undefined && arrayFunctions.has(name.toLowerCase());
}

/** Every catalog table the statement reads, by the name it reaches each one by. */
export function simAthenaQueryTables(
  ast: unknown,
  tables: readonly SimAthenaCatalogTable[],
): ReadonlyMap<string, SimAthenaCatalogTable> {
  const byName = new Map<string, SimAthenaCatalogTable>();

  for (const node of simAthenaAstNodes(ast)) {
    if (!isFromItem(node)) {
      continue;
    }

    const found = tables.find(
      (table) =>
        table.name.toLowerCase() === node.table.toLowerCase() &&
        matchesDatabase(table, node.db),
    );

    if (found !== undefined) {
      byName.set((node.as ?? node.table).toLowerCase(), found);
    }
  }

  return byName;
}

/** The Glue type of the column an `UNNEST` names. */
function declaredType(
  source: { table: string | null; column: string },
  ast: unknown,
  tables: readonly SimAthenaCatalogTable[],
): string | undefined {
  const reachable = simAthenaQueryTables(ast, tables);

  if (source.table !== null) {
    return columnType(reachable.get(source.table.toLowerCase()), source.column);
  }

  const declaring = [...new Set(reachable.values())].filter(
    (table) => columnType(table, source.column) !== undefined,
  );

  return declaring.length === 1
    ? columnType(declaring[0], source.column)
    : undefined;
}

function columnType(
  table: SimAthenaCatalogTable | undefined,
  column: string,
): string | undefined {
  return table?.columns.find(
    (one) => one.Name.toLowerCase() === column.toLowerCase(),
  )?.Type;
}

/**
 * Whether this table is the one a `FROM` entry names.
 *
 * An entry naming no database is resolved against the query's own, which the
 * table resolution has already done, so the table name alone decides it.
 */
function matchesDatabase(
  table: SimAthenaCatalogTable,
  database: string | null | undefined,
): boolean {
  return (
    database === undefined ||
    database === null ||
    database === "" ||
    table.databaseName.toLowerCase() === database.toLowerCase()
  );
}

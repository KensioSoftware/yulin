import type { DatabaseSync } from "node:sqlite";

import type { SimAthenaCatalogColumn } from "../table/sim-athena-catalog-table.js";
import { simAthenaSqliteAffinity } from "./sim-athena-column-types.js";
import { simAthenaRowValue } from "./sim-athena-engine-row.js";
import type { SimAthenaLoadedTable } from "./sim-athena-table-rows.js";
import { simAthenaSqliteValue } from "./sim-athena-sqlite-values.js";

/**
 * Every column one table's rows are held under.
 *
 * The partition keys come after the data columns, which is the order Athena
 * itself puts them in and the order `SELECT *` answers with. A key repeating
 * the name of a data column is dropped, since SQLite refuses a table with two
 * columns of one name and a Glue table carrying that duplicate is one real
 * Athena refuses to query anyway.
 */
export function simAthenaTableColumns(
  table: SimAthenaLoadedTable["table"],
): readonly SimAthenaCatalogColumn[] {
  const seen = new Set<string>();

  return [...table.columns, ...table.partitionKeys].filter((column) => {
    const name = column.Name.toLowerCase();

    if (seen.has(name)) {
      return false;
    }

    seen.add(name);

    return true;
  });
}

/**
 * Create one loaded table inside one SQLite schema and fill it.
 *
 * The schema is the Glue database, so `rainlytics.access_logs` in the query
 * resolves without anything being renamed.
 */
export function simAthenaCreateTable(
  database: DatabaseSync,
  schema: string,
  loaded: SimAthenaLoadedTable,
): void {
  const columns = simAthenaTableColumns(loaded.table);
  const qualified = `${quoted(schema)}.${quoted(loaded.table.name)}`;
  const declarations = columns
    .map(
      (column) =>
        `${quoted(column.Name)} ${simAthenaSqliteAffinity(column.Type)}`,
    )
    .join(", ");

  // A table declaring no columns is refused here, and the engine turns the
  // query down. SQLite has no table without columns, and neither has Athena.
  database.exec(`CREATE TABLE ${qualified} (${declarations})`);

  const names = columns.map((column) => quoted(column.Name)).join(", ");
  const holes = columns.map(() => "?").join(", ");
  const insert = database.prepare(
    `INSERT INTO ${qualified} (${names}) VALUES (${holes})`,
  );

  for (const row of loaded.rows) {
    insert.run(
      ...columns.map((column) =>
        simAthenaSqliteValue(simAthenaRowValue(row, column.Name), column.Type),
      ),
    );
  }
}

function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

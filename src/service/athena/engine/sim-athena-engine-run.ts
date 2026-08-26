import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaPlannedTable } from "../execution/sim-athena-query-refusal.js";
import type { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";
import { simAthenaEngineResult } from "./sim-athena-engine-result.js";
import type { SimAthenaSqlParser } from "./sim-athena-parser-module.js";
import { simAthenaSqliteDatabase } from "./sim-athena-sqlite-database.js";
import type { SimAthenaSqliteModule } from "./sim-athena-sqlite-module.js";
import {
  simAthenaTableRows,
  type SimAthenaLoadedTable,
} from "./sim-athena-table-rows.js";
import type { SimAthenaTableObjects } from "./sim-athena-table-objects.js";

/** What one query is run with, once the engine is on and has somewhere to read. */
export interface SimAthenaEngineRun {
  readonly parser: SimAthenaSqlParser;
  readonly sqlite: SimAthenaSqliteModule;
  readonly objects: SimAthenaTableObjects;
  readonly tables: readonly SimAthenaPlannedTable[];
  readonly sessionDatabase: string | undefined;
  readonly caller: SimAwsCaller | undefined;
  readonly sql: string;
}

/**
 * Load the tables, build the database and run the statement.
 *
 * Every failure from here is the engine turning the query down. Loading a table
 * can fail on an object the caller cannot open, building the database can fail
 * on a schema SQLite refuses, and running the statement can fail on anything
 * the parser wrote that SQLite does not have. All three leave the declared
 * result to answer.
 */
export async function simAthenaEngineRun(
  run: SimAthenaEngineRun,
): Promise<SimAthenaResolvedResult | undefined> {
  try {
    const loaded = await loadedTables(run);

    if (loaded === undefined) {
      return undefined;
    }

    const database = simAthenaSqliteDatabase({
      sqlite: run.sqlite,
      loaded,
      sessionDatabase: run.sessionDatabase,
    });

    try {
      return simAthenaEngineResult(database, run.sql, loaded);
    } finally {
      database.close();
    }
  } catch {
    return undefined;
  }
}

/**
 * Every table the query reads, loaded once each.
 *
 * A statement naming one table twice resolves to two entries, and loading each
 * of them would read the objects twice and then fail to create the table.
 */
async function loadedTables(
  run: SimAthenaEngineRun,
): Promise<readonly SimAthenaLoadedTable[] | undefined> {
  const loaded = await Promise.all(
    distinctTables(run.tables).map(async (planned) =>
      simAthenaTableRows({ planned, objects: run.objects, caller: run.caller }),
    ),
  );

  return loaded.includes(undefined)
    ? undefined
    : (loaded as readonly SimAthenaLoadedTable[]);
}

function distinctTables(
  tables: readonly SimAthenaPlannedTable[],
): readonly SimAthenaPlannedTable[] {
  const seen = new Set<string>();

  return tables.filter((planned) => {
    const identity =
      `${planned.table.databaseName}.${planned.table.name}`.toLowerCase();

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);

    return true;
  });
}

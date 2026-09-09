import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaPlannedTable } from "../execution/sim-athena-query-refusal.js";
import {
  simAthenaEngineAnswered,
  simAthenaEngineTurnedDown,
  type SimAthenaEngineAnswer,
} from "./sim-athena-engine-answer.js";
import { simAthenaRunFailure } from "./sim-athena-turn-down.js";
import { simAthenaEngineResult } from "./sim-athena-engine-result.js";
import type { SimAthenaSqlParser } from "./sim-athena-parser-module.js";
import { simAthenaSqliteDatabase } from "./sim-athena-sqlite-database.js";
import type { SimAthenaSqliteModule } from "./sim-athena-sqlite-module.js";
import { simAthenaLoadedTables } from "./sim-athena-loaded-tables.js";
import type { SimAthenaTableObjects } from "./sim-athena-table-objects.js";

/** What one query is run with, once the engine is on and has somewhere to read. */
export interface SimAthenaEngineRun {
  readonly parser: SimAthenaSqlParser;
  readonly sqlite: SimAthenaSqliteModule;
  readonly objects: SimAthenaTableObjects;
  readonly tables: readonly SimAthenaPlannedTable[];
  readonly sessionDatabase: string | undefined;
  readonly caller: SimAwsCaller | undefined;
  readonly startedAt: Date;
  readonly sql: string;
}

/**
 * Load the tables, build the database and run the statement.
 *
 * Every failure from here is the engine turning the query down. Loading a table
 * can fail on an object the caller cannot open, building the database can fail
 * on a schema SQLite refuses, and running the statement can fail on anything
 * the parser wrote that SQLite does not have. All three leave the declared
 * result to answer. So does a Parquet table in a project that has not installed
 * the reader, and `hyparquet` is named in the docs for that reason.
 *
 * Each of them carries a reason out, which a strict engine fails the query
 * with.
 */
export async function simAthenaEngineRun(
  run: SimAthenaEngineRun,
): Promise<SimAthenaEngineAnswer> {
  try {
    const loaded = await simAthenaLoadedTables(run);

    if (typeof loaded === "string") {
      return simAthenaEngineTurnedDown(loaded);
    }

    const database = simAthenaSqliteDatabase({
      sqlite: run.sqlite,
      loaded,
      sessionDatabase: run.sessionDatabase,
      startedAt: run.startedAt,
    });

    try {
      return simAthenaEngineAnswered(
        simAthenaEngineResult(database, run.sql, loaded),
      );
    } finally {
      database.close();
    }
  } catch (error) {
    return simAthenaEngineTurnedDown(simAthenaRunFailure(error));
  }
}

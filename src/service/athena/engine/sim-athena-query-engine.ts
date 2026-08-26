import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaPlannedTable } from "../execution/sim-athena-query-refusal.js";
import type { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";
import { simAthenaEngineRun } from "./sim-athena-engine-run.js";
import {
  simAthenaSqlParser,
  type SimAthenaSqlParser,
} from "./sim-athena-parser-module.js";
import {
  simAthenaSqliteModule,
  type SimAthenaSqliteModule,
} from "./sim-athena-sqlite-module.js";
import { simAthenaSqliteSql } from "./sim-athena-sql-translation.js";
import type { SimAthenaTableObjects } from "./sim-athena-table-objects.js";

/** What one query is run against. */
export interface SimAthenaEngineRequest {
  readonly queryString: string;
  readonly tables: readonly SimAthenaPlannedTable[];
  readonly sessionDatabase: string | undefined;
  readonly objects: SimAthenaTableObjects | undefined;
  readonly caller: SimAwsCaller | undefined;
}

/**
 * The query engine one simulated Athena scope answers with, when a test turns
 * it on.
 *
 * It is off by default and `enable()` is what turns it on. A project holding
 * `node-sql-parser` for a reason of its own would otherwise find simulated
 * Athena answering differently from the version before it, and a query engine
 * arriving unasked for is not a change a test suite should have to notice.
 *
 * Turning it on loads the parser, so a project that has not added the package
 * finds out at the line that asked for the engine rather than inside a query
 * that quietly fell back.
 *
 * Everything the engine cannot do, it turns down. A statement Athena's grammar
 * refuses, a table in a format it has no reader for, an object it cannot open
 * and a statement SQLite will not run all end the same way: no result, and the
 * declaration a test wrote answers the query instead.
 */
export class SimAthenaQueryEngine {
  #parser: SimAthenaSqlParser | undefined;
  #sqlite: SimAthenaSqliteModule | undefined;

  /** Whether this scope runs queries rather than answering from declarations. */
  get isEnabled(): boolean {
    return this.#parser !== undefined;
  }

  /**
   * Run queries in this scope for real, loading the SQL parser.
   *
   * Raises where `node-sql-parser` is absent, naming what to add. It is an
   * optional peer dependency, so a project that never runs a query never
   * installs it.
   */
  async enable(): Promise<void> {
    const parser = await simAthenaSqlParser();

    this.#sqlite = await simAthenaSqliteModule();
    this.#parser = parser;
  }

  /** Answer queries from declarations again. */
  disable(): void {
    this.#parser = undefined;
  }

  /**
   * What one query answers with, or nothing where the engine turned it down.
   */
  async run(
    request: SimAthenaEngineRequest,
  ): Promise<SimAthenaResolvedResult | undefined> {
    const parser = this.#parser;
    const sqlite = this.#sqlite;
    const { objects } = request;

    if (parser === undefined || sqlite === undefined || objects === undefined) {
      return undefined;
    }

    const sql = simAthenaSqliteSql({
      parser,
      athenaSql: request.queryString,
      tables: request.tables.map((planned) => planned.table),
    });

    return sql === undefined
      ? undefined
      : simAthenaEngineRun({ ...request, parser, sqlite, objects, sql });
  }
}

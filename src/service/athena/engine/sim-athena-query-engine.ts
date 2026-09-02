import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaPlannedTable } from "../execution/sim-athena-query-refusal.js";
import {
  simAthenaEngineRun,
  simAthenaEngineTurnedDown,
  type SimAthenaEngineAnswer,
} from "./sim-athena-engine-run.js";
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
import {
  simAthenaNoObjects,
  simAthenaUnreadableStatement,
} from "./sim-athena-turn-down.js";

/** How one scope's engine is turned on. */
export interface SimAthenaEngineOptions {
  /**
   * Whether a query the engine turns down fails rather than falling back.
   *
   * Off by default, which leaves every turn-down answering from a declaration
   * the way it always has. A test suite meaning to exercise the engine turns
   * this on, and then a query the engine quietly stopped running shows up as a
   * failing test rather than as one passing on rows nobody meant to use.
   */
  readonly strict?: boolean;
}

/** What one query is run against. */
export interface SimAthenaEngineRequest {
  readonly queryString: string;
  readonly tables: readonly SimAthenaPlannedTable[];
  readonly sessionDatabase: string | undefined;
  readonly objects: SimAthenaTableObjects | undefined;
  readonly caller: SimAwsCaller | undefined;

  /** When the query started, which `current_timestamp` answers with. */
  readonly startedAt: Date;
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
 * declaration a test wrote answers the query instead. A strict engine fails the
 * query instead of falling back, and the reason says which of them it hit.
 */
export class SimAthenaQueryEngine {
  #parser: SimAthenaSqlParser | undefined;
  #sqlite: SimAthenaSqliteModule | undefined;
  #strict = false;

  /** Whether this scope runs queries rather than answering from declarations. */
  get isEnabled(): boolean {
    return this.#parser !== undefined;
  }

  /** Whether a query this engine turns down fails rather than falling back. */
  get isStrict(): boolean {
    return this.#strict;
  }

  /**
   * Run queries in this scope for real, loading the SQL parser.
   *
   * Raises where `node-sql-parser` is absent, naming what to add. It is an
   * optional peer dependency, so a project that never runs a query never
   * installs it.
   */
  async enable(options: SimAthenaEngineOptions = {}): Promise<void> {
    const parser = await simAthenaSqlParser();

    this.#sqlite = await simAthenaSqliteModule();
    this.#parser = parser;
    this.#strict = options.strict ?? false;
  }

  /** Answer queries from declarations again. */
  disable(): void {
    this.#parser = undefined;
    this.#strict = false;
  }

  /**
   * What one query answers with, or why the engine turned it down.
   *
   * An engine nobody turned on turns nothing down. It has no opinion about the
   * query, and a scope left alone answers from declarations as it always did.
   */
  async run(request: SimAthenaEngineRequest): Promise<SimAthenaEngineAnswer> {
    const parser = this.#parser;
    const sqlite = this.#sqlite;
    const { objects } = request;

    if (parser === undefined || sqlite === undefined) {
      return { result: undefined, turnedDown: undefined };
    }

    if (objects === undefined) {
      return simAthenaEngineTurnedDown(simAthenaNoObjects);
    }

    const sql = simAthenaSqliteSql({
      parser,
      athenaSql: request.queryString,
      tables: request.tables.map((planned) => planned.table),
    });

    return sql === undefined
      ? simAthenaEngineTurnedDown(simAthenaUnreadableStatement)
      : simAthenaEngineRun({ ...request, parser, sqlite, objects, sql });
  }
}

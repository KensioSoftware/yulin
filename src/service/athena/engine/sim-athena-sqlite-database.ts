import type { DatabaseSync } from "node:sqlite";

import { simAthenaInstallAggregateShims } from "./sim-athena-aggregate-shims.js";
import { simAthenaInstallDateShims } from "./sim-athena-date-shims.js";
import { simAthenaInstallJsonShims } from "./sim-athena-json-shims.js";
import { simAthenaInstallStringShims } from "./sim-athena-string-shims.js";
import type { SimAthenaSqliteModule } from "./sim-athena-sqlite-module.js";
import { simAthenaCreateTable } from "./sim-athena-sqlite-tables.js";
import type { SimAthenaLoadedTable } from "./sim-athena-table-rows.js";

/** The SQLite schema an unqualified table name resolves in. */
const mainSchema = "main";

interface SimAthenaSqliteDatabaseRequest {
  readonly sqlite: SimAthenaSqliteModule;
  readonly loaded: readonly SimAthenaLoadedTable[];

  /**
   * The database a query runs in, where its context named one.
   *
   * A query naming its table unqualified is resolved against this, so the
   * tables in it are created in SQLite's own `main` schema as well.
   */
  readonly sessionDatabase: string | undefined;
}

/**
 * An in-memory SQLite database holding one query's tables.
 *
 * Each Glue database is attached as a SQLite schema of the same name, so
 * `rainlytics.access_logs` in the statement resolves with nothing renamed.
 * SQLite refuses to reach across attached schemas from a view, so a table the
 * query context lets a statement name unqualified is created twice rather than
 * aliased.
 */
export function simAthenaSqliteDatabase(
  request: SimAthenaSqliteDatabaseRequest,
): DatabaseSync {
  const database = new request.sqlite.DatabaseSync(":memory:");

  // SQLite matches LIKE without regard to case for ASCII and Athena matches it
  // with. Without this a filter quietly takes in rows Athena excludes, which is
  // a passing test and a wrong answer.
  database.exec("PRAGMA case_sensitive_like = ON");

  simAthenaInstallDateShims(database);
  simAthenaInstallJsonShims(database);
  simAthenaInstallStringShims(database);
  simAthenaInstallAggregateShims(database);

  const attached = new Set<string>([mainSchema]);

  for (const loaded of request.loaded) {
    const schema = loaded.table.databaseName;

    if (!attached.has(schema)) {
      database.exec(`ATTACH ':memory:' AS "${schema.replaceAll('"', '""')}"`);
      attached.add(schema);
    }

    simAthenaCreateTable(database, schema, loaded);

    if (schema === request.sessionDatabase) {
      simAthenaCreateTable(database, mainSchema, loaded);
    }
  }

  return database;
}

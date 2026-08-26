import type { DatabaseSync } from "node:sqlite";

import { simAthenaScalarShim } from "./sim-athena-shim-registry.js";

/**
 * The clock a query reads, which is the simulator's rather than the host's.
 *
 * `current_date` and `current_timestamp` are keywords in SQLite and answer from
 * the machine the test runs on. Registering a function of each name shadows
 * them, so a test that froze time gets the instant it froze and a test run
 * twice answers the same way twice.
 *
 * Athena reads both at the instant the query started, which is what the
 * execution records.
 */
export function simAthenaInstallClockShims(
  database: DatabaseSync,
  startedAt: Date,
): void {
  const started = startedAt.toISOString();

  simAthenaScalarShim(database, "current_date", () => started.slice(0, 10));
  simAthenaScalarShim(database, "current_timestamp", () =>
    started.replace("T", " ").slice(0, 23),
  );
}

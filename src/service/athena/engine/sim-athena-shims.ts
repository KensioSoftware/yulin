import type { DatabaseSync } from "node:sqlite";

import { simAthenaInstallAggregateShims } from "./sim-athena-aggregate-shims.js";
import { simAthenaInstallArrayShims } from "./sim-athena-array-shims.js";
import { simAthenaInstallClockShims } from "./sim-athena-clock-shims.js";
import { simAthenaInstallDateArithmeticShims } from "./sim-athena-date-arithmetic-shims.js";
import { simAthenaInstallDateShims } from "./sim-athena-date-shims.js";
import { simAthenaInstallJsonDocumentShims } from "./sim-athena-json-document-shims.js";
import { simAthenaInstallJsonShims } from "./sim-athena-json-shims.js";
import { simAthenaInstallRegexpShims } from "./sim-athena-regexp-shims.js";
import { simAthenaInstallStringShims } from "./sim-athena-string-shims.js";
import { simAthenaInstallUrlShims } from "./sim-athena-url-shims.js";

/**
 * Every Trino function the engine carries that SQLite does not.
 *
 * This is a list to extend as a query in a real test reaches for something
 * absent from it. A function nobody has written a shim for is left absent, and
 * SQLite refuses the statement rather than answering it, so the query falls
 * back to its declared result.
 */
export function simAthenaInstallShims(
  database: DatabaseSync,
  startedAt: Date,
): void {
  simAthenaInstallClockShims(database, startedAt);
  simAthenaInstallDateShims(database);
  simAthenaInstallDateArithmeticShims(database);
  simAthenaInstallJsonShims(database);
  simAthenaInstallJsonDocumentShims(database);
  simAthenaInstallArrayShims(database);
  simAthenaInstallStringShims(database);
  simAthenaInstallRegexpShims(database);
  simAthenaInstallUrlShims(database);
  simAthenaInstallAggregateShims(database);
}

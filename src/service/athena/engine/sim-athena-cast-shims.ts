import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import { SimAthenaSetUpError } from "../error/sim-athena.error.js";
import {
  simAthenaCastSource,
  simAthenaDateCast,
  simAthenaTimestampCast,
} from "./sim-athena-cast-rewrite.js";
import {
  simAthenaCastInstant,
  simAthenaCastRendered,
  type SimAthenaCastType,
} from "./sim-athena-cast-text.js";
import { shimText, simAthenaScalarShim } from "./sim-athena-shim-registry.js";

/**
 * Trino's casts to `DATE` and `TIMESTAMP`, which SQLite cannot do itself.
 *
 * SQLite gives both types numeric affinity, so its own cast of
 * `'2026-08-15'` answers `2026`. The statement's casts are rewritten onto
 * these shims before it runs, and the rewrite says whether the value is text.
 *
 * A value the cast cannot read fails the query with Trino's own message, the
 * way Athena fails it.
 */
export function simAthenaInstallCastShims(database: DatabaseSync): void {
  simAthenaScalarShim(
    database,
    simAthenaDateCast,
    (value, source) => cast(value, source, "date"),
    "CAST(... AS DATE)",
  );
  simAthenaScalarShim(
    database,
    simAthenaTimestampCast,
    (value, source) => cast(value, source, "timestamp"),
    "CAST(... AS TIMESTAMP)",
  );
}

function cast(
  value: SQLOutputValue | undefined,
  source: SQLOutputValue | undefined,
  type: SimAthenaCastType,
): string | null {
  const text = shimText(value);

  if (text === undefined) {
    return null;
  }

  const instant = simAthenaCastInstant(
    text,
    type,
    source === simAthenaCastSource,
  );

  if (instant === undefined) {
    throw new SimAthenaSetUpError(`Value cannot be cast to ${type}: ${text}`);
  }

  return simAthenaCastRendered(instant, type);
}

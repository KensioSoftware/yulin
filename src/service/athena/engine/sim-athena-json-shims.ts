import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import {
  simAthenaJsonAt,
  simAthenaJsonDocument,
  simAthenaJsonProperty,
} from "./sim-athena-json-path.js";
import {
  shimNumber,
  shimText,
  simAthenaScalarShim,
} from "./sim-athena-shim-registry.js";

/**
 * Trino's functions over one value inside a JSON document.
 *
 * A structured column is held as its JSON text, so each of these parses before
 * it answers and a column holding something else answers null rather than
 * failing the query.
 */
export function simAthenaInstallJsonShims(database: DatabaseSync): void {
  simAthenaScalarShim(database, "json_extract_scalar", (json, path) =>
    scalarOf(simAthenaJsonAt(shimText(json), shimText(path))),
  );
  simAthenaScalarShim(database, "cardinality", (value) => {
    const parsed = simAthenaJsonDocument(shimText(value));

    return Array.isArray(parsed) ? parsed.length : null;
  });
  simAthenaScalarShim(database, "element_at", (value, key) =>
    elementAt(simAthenaJsonDocument(shimText(value)), key),
  );
}

/**
 * One element of an array or one value of a map.
 *
 * Trino counts an array from one, counts back from the end for a negative
 * index, and has no element at zero. It reads a map by its key instead, and the
 * JSON behind either one says which of the two this is.
 */
function elementAt(
  parsed: unknown,
  key: SQLOutputValue,
): string | number | null {
  if (!Array.isArray(parsed)) {
    return scalarOf(simAthenaJsonProperty(parsed, shimText(key) ?? ""));
  }

  const at = shimNumber(key);

  if (at === undefined || at === 0) {
    return null;
  }

  return scalarOf(parsed.at(at > 0 ? at - 1 : at));
}

/**
 * One JSON value as SQLite will hold it.
 *
 * Trino answers null where a path reaches an object or an array rather than a
 * scalar, since there is no scalar there to answer with.
 */
function scalarOf(value: unknown): string | number | null {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  return typeof value === "boolean" ? String(value) : null;
}

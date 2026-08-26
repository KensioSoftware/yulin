import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import {
  shimNumber,
  shimText,
  simAthenaScalarShim,
} from "./sim-athena-shim-registry.js";

/**
 * Trino's JSON and array functions.
 *
 * A structured column is held as its JSON text, so each of these parses before
 * it answers and a column holding something else answers null rather than
 * failing the query.
 */
export function simAthenaInstallJsonShims(database: DatabaseSync): void {
  simAthenaScalarShim(database, "json_extract_scalar", (json, path) =>
    extractedScalar(shimText(json), shimText(path)),
  );
  simAthenaScalarShim(database, "cardinality", (value) => {
    const parsed = parsedJson(shimText(value));

    return Array.isArray(parsed) ? parsed.length : null;
  });
  simAthenaScalarShim(database, "element_at", (value, key) =>
    elementAt(parsedJson(shimText(value)), key),
  );
}

function parsedJson(text: string | undefined): unknown {
  if (text === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * One scalar out of a JSON document, by a `$.a.b` path.
 *
 * Trino answers null for a path that reaches nothing and for a path that
 * reaches an object or an array rather than a scalar.
 */
function extractedScalar(
  json: string | undefined,
  path: string | undefined,
): string | number | null {
  if (path === undefined) {
    return null;
  }

  const keys = path.replace(/^\$\.?/u, "").split(".");
  let current = parsedJson(json);

  for (const key of keys) {
    current = key.length === 0 ? current : propertyOf(current, key);
  }

  return scalarOf(current);
}

/**
 * One element of an array or one value of a map.
 *
 * Trino counts an array from one and reads a map by its key, and the JSON
 * behind either one says which of the two this is.
 */
function elementAt(
  parsed: unknown,
  key: SQLOutputValue,
): string | number | null {
  if (!Array.isArray(parsed)) {
    return scalarOf(propertyOf(parsed, shimText(key) ?? ""));
  }

  const at = shimNumber(key);

  return at === undefined ? null : scalarOf(parsed.at(at - 1));
}

function propertyOf(value: unknown, key: string): unknown {
  if (
    typeof value !== "object" ||
    value === null ||
    !Object.hasOwn(value, key)
  ) {
    return undefined;
  }

  // The key comes out of the query's own JSON path, which is what this reads.
  // oxlint-disable-next-line security/detect-object-injection
  return (value as Record<string, unknown>)[key];
}

function scalarOf(value: unknown): string | number | null {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  return typeof value === "boolean" ? String(value) : null;
}

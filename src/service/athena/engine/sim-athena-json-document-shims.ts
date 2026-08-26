import type { DatabaseSync } from "node:sqlite";

import { shimText, simAthenaScalarShim } from "./sim-athena-shim-registry.js";
import {
  simAthenaJsonAt,
  simAthenaJsonDocument,
} from "./sim-athena-json-path.js";

/**
 * Trino's functions over a whole JSON document.
 *
 * These answer with JSON text where Trino answers with a JSON value, which is
 * the same thing here, because a structured column is held as its JSON text
 * throughout the engine.
 *
 * `json_extract` shadows SQLite's own. SQLite's unwraps a string, so
 * `json_extract('{"a":"x"}', '$.a')` answers `x` where Trino answers `"x"`. A
 * statement comparing that against a bare string matches on one and not the
 * other, and Trino is the one this follows.
 */
export function simAthenaInstallJsonDocumentShims(
  database: DatabaseSync,
): void {
  simAthenaScalarShim(database, "json_extract", (json, path) => {
    const found = simAthenaJsonAt(shimText(json), shimText(path));

    return found === undefined ? null : JSON.stringify(found);
  });

  simAthenaScalarShim(database, "json_parse", (text) => {
    const parsed = simAthenaJsonDocument(shimText(text));

    return parsed === undefined ? null : JSON.stringify(parsed);
  });

  simAthenaScalarShim(database, "json_size", (json, path) =>
    sizeOf(simAthenaJsonAt(shimText(json), shimText(path))),
  );
}

/**
 * How many entries a value holds.
 *
 * An array counts its elements and an object counts its keys. Trino answers
 * zero for a scalar, since a scalar holds no entries at all.
 */
function sizeOf(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.length;
  }

  return typeof value === "object" ? Object.keys(value).length : 0;
}

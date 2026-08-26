import type { DatabaseSync } from "node:sqlite";

import {
  shimNumber,
  shimText,
  simAthenaScalarShim,
} from "./sim-athena-shim-registry.js";

/**
 * Trino's string functions.
 *
 * `substr` and `format` are deliberately absent. SQLite carries both, counts
 * from one the way Trino does, and takes the same `%s` and `%d` a statement
 * writes, so registering a name for either would replace something that works
 * with something that works less well.
 */
export function simAthenaInstallStringShims(database: DatabaseSync): void {
  simAthenaScalarShim(database, "split_part", (value, delimiter, index) =>
    splitPart(shimText(value), shimText(delimiter), shimNumber(index)),
  );
  simAthenaScalarShim(database, "strpos", (value, search) =>
    position(shimText(value), shimText(search)),
  );
}

/** Trino counts the fields from one, and has no field below that. */
function splitPart(
  value: string | undefined,
  delimiter: string | undefined,
  index: number | undefined,
): string | null {
  if (value === undefined || delimiter === undefined || index === undefined) {
    return null;
  }

  return index < 1 ? null : (value.split(delimiter)[index - 1] ?? null);
}

/** Trino counts the position of a substring from one, and zero for absent. */
function position(
  value: string | undefined,
  search: string | undefined,
): number | null {
  if (value === undefined || search === undefined) {
    return null;
  }

  return value.indexOf(search) + 1;
}

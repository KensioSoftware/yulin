import type { DatabaseSync } from "node:sqlite";

import { SimAthenaSetUpError } from "../error/sim-athena.error.js";
import {
  isExplicitNull,
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
  simAthenaScalarShim(database, "split", (...values) =>
    isExplicitNull(values, 2)
      ? null
      : split(
          shimText(values.at(0)),
          shimText(values.at(1)),
          shimNumber(values.at(2)),
        ),
  );
  simAthenaScalarShim(database, "split_part", (value, delimiter, index) =>
    splitPart(shimText(value), shimText(delimiter), shimNumber(index)),
  );
  simAthenaScalarShim(database, "strpos", (value, search) =>
    position(shimText(value), shimText(search)),
  );
}

/**
 * One value cut into an array, written as the JSON text an array is held as.
 *
 * Trino answers with one empty element over an empty value, and refuses an
 * empty delimiter rather than answering a character at a time. A limit caps
 * how many elements come back and leaves the rest of the value in the last of
 * them.
 */
function split(
  value: string | undefined,
  delimiter: string | undefined,
  limit: number | undefined,
): string | null {
  if (value === undefined || delimiter === undefined) {
    return null;
  }

  if (delimiter === "" || (limit !== undefined && limit < 1)) {
    throw new SimAthenaSetUpError(
      "split takes a delimiter of at least one character and a limit from one",
    );
  }

  const parts = value.split(delimiter);

  if (limit === undefined || parts.length <= limit) {
    return JSON.stringify(parts);
  }

  return JSON.stringify([
    ...parts.slice(0, limit - 1),
    parts.slice(limit - 1).join(delimiter),
  ]);
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

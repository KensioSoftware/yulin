import type { DatabaseSync } from "node:sqlite";

import {
  shimNumber,
  shimText,
  simAthenaScalarShim,
} from "./sim-athena-shim-registry.js";

/** Trino's string functions. */
export function simAthenaInstallStringShims(database: DatabaseSync): void {
  simAthenaScalarShim(database, "regexp_like", (value, pattern) =>
    matches(shimText(value), shimText(pattern)),
  );
  simAthenaScalarShim(database, "split_part", (value, delimiter, index) =>
    splitPart(shimText(value), shimText(delimiter), shimNumber(index)),
  );
  simAthenaScalarShim(database, "strpos", (value, search) =>
    position(shimText(value), shimText(search)),
  );
}

function matches(
  value: string | undefined,
  pattern: string | undefined,
): number | null {
  if (value === undefined || pattern === undefined) {
    return null;
  }

  try {
    // The pattern is the query's own, which is the whole point of the function.
    // oxlint-disable-next-line security/detect-non-literal-regexp
    return new RegExp(pattern, "u").test(value) ? 1 : 0;
  } catch {
    return null;
  }
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

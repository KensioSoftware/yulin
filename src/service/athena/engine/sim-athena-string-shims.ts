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
  simAthenaScalarShim(database, "regexp_like", (value, pattern) =>
    matches(shimText(value), shimText(pattern)),
  );
  simAthenaScalarShim(database, "regexp_extract", (value, pattern, group) =>
    extracted(shimText(value), shimText(pattern), shimNumber(group) ?? 0),
  );
  simAthenaScalarShim(database, "regexp_replace", (value, pattern, with_) =>
    replaced(shimText(value), shimText(pattern), shimText(with_) ?? ""),
  );
  simAthenaScalarShim(database, "split_part", (value, delimiter, index) =>
    splitPart(shimText(value), shimText(delimiter), shimNumber(index)),
  );
  simAthenaScalarShim(database, "strpos", (value, search) =>
    position(shimText(value), shimText(search)),
  );
}

/**
 * The first thing a pattern matches, or the capture group a call names.
 *
 * Trino counts the groups from one and calls the whole match zero, which is
 * what a regular expression counts them as anywhere.
 */
function extracted(
  value: string | undefined,
  pattern: string | undefined,
  group: number,
): string | null {
  const found = expressionFor(pattern)?.exec(value ?? "");

  return value === undefined ? null : (found?.at(group) ?? null);
}

/**
 * Every match replaced.
 *
 * Trino writes a capture group into the replacement as `$1`, which is what
 * JavaScript writes too. A call naming no replacement takes the matches out.
 */
function replaced(
  value: string | undefined,
  pattern: string | undefined,
  replacement: string,
): string | null {
  const expression = expressionFor(pattern, "gu");

  if (value === undefined || expression === undefined) {
    return null;
  }

  // The replacement is the statement's own, and Trino writes a capture group
  // into it the same way JavaScript does.
  // oxlint-disable-next-line unicorn-js/no-unsafe-string-replacement
  return value.replaceAll(expression, replacement);
}

/**
 * One pattern out of the statement, or nothing where it is no pattern at all.
 *
 * Trino fails a query carrying a pattern it cannot read, and answering null
 * turns the query down to its declared result instead.
 */
function expressionFor(
  pattern: string | undefined,
  flags = "u",
): RegExp | undefined {
  if (pattern === undefined) {
    return undefined;
  }

  try {
    // The pattern is the query's own, which is the whole point of the function.
    // oxlint-disable-next-line security/detect-non-literal-regexp
    return new RegExp(pattern, flags);
  } catch {
    return undefined;
  }
}

function matches(
  value: string | undefined,
  pattern: string | undefined,
): number | null {
  const expression = expressionFor(pattern);

  if (value === undefined || expression === undefined) {
    return null;
  }

  return expression.test(value) ? 1 : 0;
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

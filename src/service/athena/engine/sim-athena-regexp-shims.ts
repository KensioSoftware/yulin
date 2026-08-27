import type { DatabaseSync } from "node:sqlite";

import { SimAthenaSetUpError } from "../error/sim-athena.error.js";
import { simAthenaLiftedPattern } from "./sim-athena-regexp-flags.js";
import {
  isExplicitNull,
  shimNumber,
  shimText,
  simAthenaScalarShim,
} from "./sim-athena-shim-registry.js";

/**
 * Trino's regular expression functions.
 *
 * Each of these answers null over a pattern it cannot read, where Trino fails
 * the query. That is the forgiving direction the rest of the engine takes.
 */
export function simAthenaInstallRegexpShims(database: DatabaseSync): void {
  simAthenaScalarShim(database, "regexp_like", (value, pattern) =>
    matches(shimText(value), shimText(pattern)),
  );

  simAthenaScalarShim(database, "regexp_extract", (...values) =>
    isExplicitNull(values, 2)
      ? null
      : extracted(
          shimText(values.at(0)),
          shimText(values.at(1)),
          shimNumber(values.at(2)) ?? 0,
        ),
  );

  simAthenaScalarShim(database, "regexp_replace", (...values) =>
    isExplicitNull(values, 2)
      ? null
      : replaced(
          shimText(values.at(0)),
          shimText(values.at(1)),
          shimText(values.at(2)) ?? "",
        ),
  );
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

/**
 * The first thing a pattern matches, or the capture group a call names.
 *
 * Trino counts the groups from one and calls the whole match zero, which is
 * what a regular expression counts them as anywhere. Trino also refuses a group
 * the pattern has not got, and raising here turns the query down rather than
 * letting a negative index quietly count back from the end.
 */
function extracted(
  value: string | undefined,
  pattern: string | undefined,
  group: number,
): string | null {
  if (!Number.isSafeInteger(group) || group < 0) {
    throw new SimAthenaSetUpError(`${String(group)} is no capture group`);
  }

  const found = expressionFor(pattern)?.exec(value ?? "");

  if (value === undefined || found === undefined || found === null) {
    return null;
  }

  if (group >= found.length) {
    throw new SimAthenaSetUpError(
      `the pattern has no capture group ${String(group)}`,
    );
  }

  return found.at(group) ?? null;
}

/**
 * Every match replaced.
 *
 * A call naming no replacement takes the matches out.
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

  // The replacement is the statement's own, written the way Trino has it.
  // oxlint-disable-next-line unicorn-js/no-unsafe-string-replacement
  return value.replaceAll(expression, javaScriptReplacement(replacement));
}

/**
 * One replacement written the way JavaScript reads it.
 *
 * Trino follows Java, which names a group `${name}` and escapes a literal
 * dollar as `\$`. JavaScript writes those two `$<name>` and `$$`, and reads
 * `${name}` as a dollar followed by braces. A numbered group is `$1` in both.
 */
function javaScriptReplacement(replacement: string): string {
  return replacement
    .replaceAll(String.raw`\$`, "$$$$")
    .replaceAll(/\$\{(\w+)\}/gu, "$<$1>");
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

  const lifted = simAthenaLiftedPattern(pattern, flags);

  try {
    // The pattern is the query's own, which is the whole point of the function.
    // oxlint-disable-next-line security/detect-non-literal-regexp
    return new RegExp(lifted.pattern, lifted.flags);
  } catch {
    return undefined;
  }
}

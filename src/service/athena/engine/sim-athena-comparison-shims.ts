import type { DatabaseSync, SQLInputValue, SQLOutputValue } from "node:sqlite";

import { SimAthenaSetUpError } from "../error/sim-athena.error.js";
import { simAthenaScalarShim } from "./sim-athena-shim-registry.js";

/**
 * Trino's `least` and `greatest`.
 *
 * SQLite carries both already, as the two argument and wider forms of `min`
 * and `max`. A rewrite renaming the call would reach the same words written
 * inside a string literal. SQLite resolves a shim by the name the statement
 * wrote, and the ordering is done here.
 *
 * Trino answers null where any argument is null, and SQLite's own `min` and
 * `max` answer the same way.
 */
export function simAthenaInstallComparisonShims(database: DatabaseSync): void {
  simAthenaScalarShim(database, "least", (...values) => extremeOf(values, -1));
  simAthenaScalarShim(database, "greatest", (...values) =>
    extremeOf(values, 1),
  );
}

/**
 * The argument at one end of the ordering, taking -1 for the low end.
 *
 * Trino takes two arguments at least. SQLite hands over whatever the call
 * wrote, and a call carrying none of them answers null.
 */
function extremeOf(
  values: readonly SQLOutputValue[],
  wanted: -1 | 1,
): SQLInputValue {
  if (values.length === 0 || values.includes(null)) {
    return null;
  }

  return values.reduce((held, value) =>
    ordering(value, held) === wanted ? value : held,
  );
}

/**
 * How two arguments order, as -1, 0 or 1.
 *
 * Numbers order numerically and everything else orders by its text. SQLite's
 * own `min` and `max` order the same pair the same way. Trino refuses a call
 * mixing types. None of the shims here check types, and a mixed call is
 * ordered as text.
 */
function ordering(one: SQLOutputValue, other: SQLOutputValue): number {
  if (isNumeric(one) && isNumeric(other)) {
    return signOf(one < other, one > other);
  }

  const left = comparableText(one);
  const right = comparableText(other);

  return signOf(left < right, left > right);
}

/** One comparison read back as -1, 0 or 1. */
function signOf(below: boolean, above: boolean): number {
  if (below) {
    return -1;
  }

  return above ? 1 : 0;
}

function isNumeric(value: SQLOutputValue): value is bigint | number {
  return typeof value === "number" || typeof value === "bigint";
}

/**
 * One argument as the text it orders by.
 *
 * A `varbinary` orders by its bytes in Trino, and nothing written out here
 * orders the same way. A call over one raises and the query falls back to its
 * declared result.
 */
function comparableText(value: SQLOutputValue): string {
  if (value instanceof Uint8Array) {
    throw new SimAthenaSetUpError(
      "least and greatest take numbers or text rather than a varbinary",
    );
  }

  return String(value);
}

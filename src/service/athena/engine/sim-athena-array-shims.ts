import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import { SimAthenaSetUpError } from "../error/sim-athena.error.js";
import { simAthenaJsonDocument } from "./sim-athena-json-path.js";
import {
  isExplicitNull,
  shimNumber,
  shimText,
  simAthenaScalarShim,
} from "./sim-athena-shim-registry.js";

/**
 * Trino's array functions, over the JSON text an array column is held as.
 *
 * `array_agg` collects into that same JSON text, so a rollup can be flattened
 * again with `UNNEST` or read with `cardinality`.
 *
 * `filter` is deliberately absent. Its second argument is a lambda, which SQLite
 * has no room for, and registering a name for it would leave the lambda to be
 * read as SQLite's own JSON operator and answer something rather than failing.
 */
export function simAthenaInstallArrayShims(database: DatabaseSync): void {
  simAthenaScalarShim(database, "contains", (value, element) =>
    contains(arrayOf(value), element),
  );

  simAthenaScalarShim(database, "array_join", (...values) =>
    isExplicitNull(values, 2)
      ? null
      : joined(
          arrayOf(values.at(0)),
          shimText(values.at(1)),
          shimText(values.at(2)),
        ),
  );

  simAthenaScalarShim(database, "slice", (value, start, length) =>
    sliced(arrayOf(value), shimNumber(start), shimNumber(length)),
  );

  database.aggregate("array_agg", {
    start: "[]",
    step: (accumulator: string, value: SQLOutputValue) =>
      JSON.stringify([
        ...(JSON.parse(accumulator) as unknown[]),
        typeof value === "bigint" ? Number(value) : value,
      ]),
    result: (accumulator: string) => accumulator,
  });
}

function arrayOf(value: unknown): unknown[] | undefined {
  const parsed = simAthenaJsonDocument(shimText(value as never));

  return Array.isArray(parsed) ? parsed : undefined;
}

/** Whether an array holds this element, compared the way JSON writes it. */
function contains(
  array: unknown[] | undefined,
  element: SQLOutputValue,
): number | null {
  if (array === undefined) {
    return null;
  }

  const wanted = JSON.stringify(
    typeof element === "bigint" ? Number(element) : element,
  );

  return array.some((one) => JSON.stringify(one) === wanted) ? 1 : 0;
}

/**
 * One array written out as text.
 *
 * Trino leaves a null element out unless the call names what to write in its
 * place, which is what the third argument is for.
 */
function joined(
  array: unknown[] | undefined,
  delimiter: string | undefined,
  absent: string | undefined,
): string | null {
  if (array === undefined || delimiter === undefined) {
    return null;
  }

  return array
    .map((one) => (one === null ? absent : scalarText(one)))
    .filter((one) => one !== undefined)
    .join(delimiter);
}

/**
 * One element written out.
 *
 * Trino refuses to join an array whose elements are not text, and raising here
 * turns the query down to its declared result instead.
 */
function scalarText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  throw new SimAthenaSetUpError("array_join takes an array of scalars");
}

/**
 * A run of one array, counted from one the way Trino counts.
 *
 * A negative start counts back from the end. A run reaching past the end stops
 * there rather than failing.
 */
function sliced(
  array: unknown[] | undefined,
  start: number | undefined,
  length: number | undefined,
): string | null {
  if (array === undefined || start === undefined || length === undefined) {
    return null;
  }

  if (start === 0 || length < 0) {
    throw new SimAthenaSetUpError(
      "slice takes a start from one and a length from zero",
    );
  }

  const from = start > 0 ? start - 1 : Math.max(array.length + start, 0);

  return JSON.stringify(array.slice(from, from + length));
}

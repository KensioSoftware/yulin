import type { SimGluePartitionColumn } from "./sim-glue-partition-columns.js";
import {
  simGlueNumericValue,
  type SimGluePartitionLiteral,
} from "./sim-glue-partition-literal.js";

/**
 * What one operator asks of the order between a stored value and a literal.
 *
 * The order is negative, zero or positive, the way a sort comparator reports
 * one, and each operator is the question it asks about that number.
 */
export type SimGlueOrderTest = (placed: number) => boolean;

/** The test `=` and an `IN` entry make. */
export const simGlueEqual: SimGlueOrderTest = (placed): boolean => placed === 0;

/** The test the lower end of a `BETWEEN` makes. */
export const simGlueAtLeast: SimGlueOrderTest = (placed): boolean =>
  placed >= 0;

/** The test the upper end of a `BETWEEN` makes. */
export const simGlueAtMost: SimGlueOrderTest = (placed): boolean => placed <= 0;

/** The operator an expression writes, and the test it makes. */
const comparisons = new Map<string, SimGlueOrderTest>([
  ["=", simGlueEqual],
  ["<>", (placed): boolean => placed !== 0],
  ["!=", (placed): boolean => placed !== 0],
  ["<", (placed): boolean => placed < 0],
  ["<=", simGlueAtMost],
  [">", (placed): boolean => placed > 0],
  [">=", simGlueAtLeast],
]);

/** The test one written operator makes, or nothing where it is not one. */
export function simGlueComparisonTest(
  operator: string,
): SimGlueOrderTest | undefined {
  return comparisons.get(operator);
}

/** The value of one partition key, in a partition's positional values. */
export function simGlueColumnValue(
  column: SimGluePartitionColumn,
  values: readonly string[],
): string {
  return values[column.index] ?? "";
}

/**
 * How one stored value sits against a literal, or `undefined` where the two
 * cannot be put in order.
 *
 * A key declared as a number whose stored value is not one has no place in a
 * numeric order. It matches nothing rather than failing the request, since the
 * partition was registered with that value and reading the table should still
 * answer.
 */
export function simGluePartitionOrder(
  column: SimGluePartitionColumn,
  stored: string,
  literal: SimGluePartitionLiteral,
): number | undefined {
  if (column.comparison === "text") {
    return stored < literal.text ? -1 : stored > literal.text ? 1 : 0;
  }

  const value = simGlueNumericValue(stored);

  return Number.isNaN(value) ? undefined : value - literal.numeric;
}

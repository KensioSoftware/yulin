import type {
  SimIamScalarConditionValue,
  SimIamValueComparison,
} from "./sim-iam-value-comparison.js";

/**
 * Read one value as a number.
 *
 * A policy document writes numbers as JSON numbers or as numeric strings, and a
 * service can supply either. An empty string, a boolean and a non-finite value
 * are no number at all. JavaScript would coerce some of them.
 */
export function simIamNumberOf(
  value: SimIamScalarConditionValue,
): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Build a comparison over two numbers from the order it accepts.
 */
export function simIamOrderedComparison(
  read: (value: SimIamScalarConditionValue) => number | undefined,
  accepts: (actual: number, expected: number) => boolean,
): SimIamValueComparison {
  return (actual, expected) => {
    const actualNumber = read(actual);
    const expectedNumber = read(expected);

    if (actualNumber === undefined || expectedNumber === undefined) {
      return;
    }

    return accepts(actualNumber, expectedNumber);
  };
}

/**
 * The orders the numeric and date operators compare by, keyed by the suffix
 * their keywords share.
 *
 * `NumericNotEquals` and `DateNotEquals` are the `Equals` order negated.
 */
export const simIamOrders: ReadonlyMap<
  string,
  (actual: number, expected: number) => boolean
> = new Map([
  [
    "Equals",
    (actual: number, expected: number): boolean => actual === expected,
  ],
  [
    "LessThan",
    (actual: number, expected: number): boolean => actual < expected,
  ],
  [
    "LessThanEquals",
    (actual: number, expected: number): boolean => actual <= expected,
  ],
  [
    "GreaterThan",
    (actual: number, expected: number): boolean => actual > expected,
  ],
  [
    "GreaterThanEquals",
    (actual: number, expected: number): boolean => actual >= expected,
  ],
]);

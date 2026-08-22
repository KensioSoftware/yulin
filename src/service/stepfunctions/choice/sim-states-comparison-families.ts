import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  SimStatesComparison,
  type SimStatesOperandType,
} from "./sim-states-comparison.js";

/**
 * Read a JSON value as a string, or as nothing where it is not one.
 */
export function readString(value: JSONValue | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value;
}

/**
 * Read a JSON value as a number, or as nothing where it is not one.
 */
export function readNumber(value: JSONValue | undefined): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }

  return value;
}

/**
 * The five ordering comparators over one JSON type.
 *
 * A value of the wrong type on either side answers false rather than failing.
 * `StringEquals` against a number is a comparison that does not hold, and a
 * rule the input does not match is the ordinary case in a `Choice` state.
 */
export function orderedComparisons<T>(
  prefix: string,
  operandType: SimStatesOperandType,
  read: (value: JSONValue | undefined) => T | undefined,
): SimStatesComparison[] {
  const comparison = (
    suffix: string,
    holds: (left: T, right: T) => boolean,
  ): SimStatesComparison =>
    new SimStatesComparison({
      name: `${prefix}${suffix}`,
      operandType,
      needsValue: true,
      operandIsPath: false,
      holds: (variable, operand): boolean => {
        const left = read(variable);
        const right = read(operand);

        if (left === undefined || right === undefined) {
          return false;
        }

        return holds(left, right);
      },
    });

  return [
    comparison("Equals", (left, right) => left === right),
    comparison("LessThan", (left, right) => left < right),
    comparison("GreaterThan", (left, right) => left > right),
    comparison("LessThanEquals", (left, right) => left <= right),
    comparison("GreaterThanEquals", (left, right) => left >= right),
  ];
}

/**
 * One data-test comparator, such as `IsString`.
 *
 * These are the comparators that answer for a `Variable` selecting nothing,
 * which is what makes `IsPresent` usable as the first test in an `And`.
 */
export function dataTest(
  name: string,
  describes: (variable: JSONValue | undefined) => boolean,
): SimStatesComparison {
  return new SimStatesComparison({
    name,
    operandType: "boolean",
    needsValue: false,
    operandIsPath: false,
    holds: (variable, operand): boolean => describes(variable) === operand,
  });
}

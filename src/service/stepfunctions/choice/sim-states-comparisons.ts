import { readSimStatesTimestamp } from "../data/sim-states-timestamp.js";
import { SimStatesComparison } from "./sim-states-comparison.js";
import {
  dataTest,
  orderedComparisons,
  readNumber,
  readString,
} from "./sim-states-comparison-families.js";
import { simStatesGlobMatches } from "./sim-states-glob.js";

/**
 * `StringMatches`, which is the one comparator taking a wildcard pattern.
 *
 * Amazon States Language gives it no `Path` twin, so neither does this.
 */
const stringMatches = new SimStatesComparison({
  name: "StringMatches",
  operandType: "string",
  needsValue: true,
  operandIsPath: false,
  holds: (variable, operand): boolean => {
    const value = readString(variable);
    const pattern = readString(operand);

    if (value === undefined || pattern === undefined) {
      return false;
    }

    return simStatesGlobMatches(pattern, value);
  },
});

const booleanEquals = new SimStatesComparison({
  name: "BooleanEquals",
  operandType: "boolean",
  needsValue: true,
  operandIsPath: false,
  holds: (variable, operand): boolean =>
    typeof variable === "boolean" && variable === operand,
});

/**
 * Every comparator a `Choice` rule can be written with.
 *
 * Each comparator taking an operand has a `Path` twin reading that operand
 * from the state's input. The data tests take a boolean the definition writes
 * out, and have none.
 */
function allComparisons(): SimStatesComparison[] {
  const compared = [
    ...orderedComparisons("String", "string", readString),
    ...orderedComparisons("Numeric", "number", readNumber),
    ...orderedComparisons("Timestamp", "string", readSimStatesTimestamp),
    booleanEquals,
  ];

  return [
    ...compared,
    ...compared.map((comparison) => comparison.readingItsOperandFromAPath()),
    stringMatches,
    dataTest("IsPresent", (variable) => variable !== undefined),
    dataTest("IsNull", (variable) => variable === null),
    dataTest("IsBoolean", (variable) => typeof variable === "boolean"),
    dataTest("IsNumeric", (variable) => typeof variable === "number"),
    dataTest("IsString", (variable) => typeof variable === "string"),
    dataTest(
      "IsTimestamp",
      (variable) => readSimStatesTimestamp(variable) !== undefined,
    ),
  ];
}

const comparisons = new Map<string, SimStatesComparison>(
  allComparisons().map((comparison) => [comparison.name, comparison]),
);

/**
 * The comparator of a name, or nothing where no comparator has it.
 */
export function findSimStatesComparison(
  name: string,
): SimStatesComparison | undefined {
  return comparisons.get(name);
}

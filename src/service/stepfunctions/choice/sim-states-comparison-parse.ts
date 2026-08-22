import type { JSONValue } from "../../../util/type-guard/json.js";
import { parseSimStatesReferencePath } from "../data/sim-states-reference-path.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";
import {
  type SimStatesChoiceOperand,
  SimStatesLiteralOperand,
  SimStatesPathOperand,
} from "./sim-states-choice-operand.js";
import {
  type SimStatesChoiceTest,
  SimStatesVariableTest,
} from "./sim-states-choice-test.js";
import type { SimStatesComparison } from "./sim-states-comparison.js";

interface SimStatesComparisonTestProperties {
  readonly stateName: string;
  readonly record: Record<string, JSONValue>;
  readonly comparison: SimStatesComparison;
  readonly written: JSONValue;
}

/**
 * Read a comparison of the value at a `Variable` path against an operand.
 */
export function parseSimStatesComparisonTest(
  properties: SimStatesComparisonTestProperties,
): SimStatesChoiceTest {
  const { stateName, record, comparison, written } = properties;
  const variable = record["Variable"];

  if (typeof variable !== "string") {
    throw new SimStatesInvalidDefinition(
      `A ${comparison.name} rule in the Choice state ${stateName} has no ` +
        "Variable naming the value to compare.",
    );
  }

  checkOperandType(stateName, comparison, written);

  return new SimStatesVariableTest({
    path: variable,
    segments: parseSimStatesReferencePath(variable),
    comparison,
    operand: readOperand(comparison, written),
  });
}

/**
 * Read a comparator's operand, either as written or as a path to read it from.
 */
function readOperand(
  comparison: SimStatesComparison,
  written: JSONValue,
): SimStatesChoiceOperand {
  if (typeof written === "string" && comparison.operandIsPath) {
    return new SimStatesPathOperand(
      written,
      parseSimStatesReferencePath(written),
    );
  }

  return new SimStatesLiteralOperand(written);
}

/**
 * Check that a comparator's operand is the kind of value it compares.
 */
function checkOperandType(
  stateName: string,
  comparison: SimStatesComparison,
  written: JSONValue,
): void {
  if (typeof written === comparison.operandType) {
    return;
  }

  throw new SimStatesInvalidDefinition(
    `A ${comparison.name} rule in the Choice state ${stateName} compares ` +
      `against ${JSON.stringify(written)}, and ${comparison.name} takes a ` +
      `${comparison.operandType}.`,
  );
}

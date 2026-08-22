import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";

// What a rule carries besides the test it makes.
const ruleFields = new Set(["Variable", "Next", "Comment"]);

/**
 * Find the field naming what a rule tests.
 */
export function readSimStatesRuleOperator(
  stateName: string,
  record: Record<string, JSONValue>,
): string {
  const operators = Object.keys(record).filter(
    (field) => !ruleFields.has(field),
  );
  const [operator] = operators;

  if (operator === undefined) {
    throw new SimStatesInvalidDefinition(
      `A rule in the Choice state ${stateName} tests nothing. A rule carries ` +
        "one comparator, or an And, an Or or a Not.",
    );
  }

  if (operators.length > 1) {
    throw new SimStatesInvalidDefinition(
      `A rule in the Choice state ${stateName} carries ` +
        `${operators.join(", ")}. A rule carries one comparator, or an And, ` +
        "an Or or a Not.",
    );
  }

  return operator;
}

/**
 * Read one rule as the object it has to be.
 */
export function asSimStatesRuleRecord(
  stateName: string,
  rule: JSONValue | undefined,
): Record<string, JSONValue> {
  if (!isRecord(rule)) {
    throw new SimStatesInvalidDefinition(
      `A rule in the Choice state ${stateName} is not an object.`,
    );
  }

  return rule;
}

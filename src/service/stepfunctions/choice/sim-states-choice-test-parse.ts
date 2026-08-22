import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";
import {
  SimStatesAllTest,
  SimStatesAnyTest,
  SimStatesNotTest,
} from "./sim-states-choice-group-test.js";
import {
  asSimStatesRuleRecord,
  readSimStatesRuleOperator,
} from "./sim-states-choice-rule-record.js";
import type { SimStatesChoiceTest } from "./sim-states-choice-test.js";
import { parseSimStatesComparisonTest } from "./sim-states-comparison-parse.js";
import { findSimStatesComparison } from "./sim-states-comparisons.js";

const booleanOperators = new Set(["And", "Or", "Not"]);

/**
 * Read a rule nested inside an `And`, an `Or` or a `Not`.
 *
 * Only a top-level rule says where the execution goes, so a nested one
 * carrying `Next` is refused rather than quietly ignored.
 */
function parseNestedTest(
  stateName: string,
  operator: string,
  rule: JSONValue | undefined,
): SimStatesChoiceTest {
  const record = asSimStatesRuleRecord(stateName, rule);

  if (Object.hasOwn(record, "Next")) {
    throw new SimStatesInvalidDefinition(
      `A rule inside the ${operator} of the Choice state ${stateName} ` +
        "carries Next. Only the rule at the top of a Choices entry says " +
        "where the execution goes.",
    );
  }

  return parseSimStatesChoiceTest(stateName, record);
}

/**
 * Read the one test a rule makes.
 */
export function parseSimStatesChoiceTest(
  stateName: string,
  record: Record<string, JSONValue>,
): SimStatesChoiceTest {
  const operator = readSimStatesRuleOperator(stateName, record);
  // The operator was read off this record's own keys, so it holds a value.
  // oxlint-disable-next-line security/detect-object-injection
  const written = record[operator] as JSONValue;

  if (booleanOperators.has(operator)) {
    checkNoVariable(stateName, operator, record);

    return parseBooleanTest(stateName, operator, written);
  }

  const comparison = findSimStatesComparison(operator);

  if (comparison === undefined) {
    throw new SimStatesInvalidDefinition(
      `A rule in the Choice state ${stateName} tests with ${operator}, which ` +
        "is not a comparator Amazon States Language defines.",
    );
  }

  return parseSimStatesComparisonTest({
    stateName,
    record,
    comparison,
    written,
  });
}

/**
 * Read an `And`, an `Or` or a `Not` and the rules it holds.
 */
function parseBooleanTest(
  stateName: string,
  operator: string,
  written: JSONValue | undefined,
): SimStatesChoiceTest {
  if (operator === "Not") {
    return new SimStatesNotTest(parseNestedTest(stateName, operator, written));
  }

  if (!Array.isArray(written) || written.length === 0) {
    throw new SimStatesInvalidDefinition(
      `The ${operator} in a rule of the Choice state ${stateName} is not a ` +
        "non-empty array of rules.",
    );
  }

  const tests = written.map((nested) =>
    parseNestedTest(stateName, operator, nested),
  );

  if (operator === "And") {
    return new SimStatesAllTest(tests);
  }

  return new SimStatesAnyTest(tests);
}

/**
 * An `And`, an `Or` or a `Not` tests rules rather than a value of its own.
 */
function checkNoVariable(
  stateName: string,
  operator: string,
  record: Record<string, JSONValue>,
): void {
  if (Object.hasOwn(record, "Variable")) {
    throw new SimStatesInvalidDefinition(
      `The ${operator} in a rule of the Choice state ${stateName} carries a ` +
        "Variable. The rules it holds carry their own.",
    );
  }
}

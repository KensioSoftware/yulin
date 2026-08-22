import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";
import { SimStatesChoiceRule } from "./sim-states-choice-rule.js";
import { asSimStatesRuleRecord } from "./sim-states-choice-rule-record.js";
import { parseSimStatesChoiceTest } from "./sim-states-choice-test-parse.js";

/**
 * Read a `Choice` state's rules, refusing anything this cannot test.
 *
 * The rules are read when the state machine is created, so a `Choice` state
 * that runs is one whose comparators, paths and operand types are already
 * known to be good.
 */
export function parseSimStatesChoices(
  stateName: string,
  state: Record<string, JSONValue>,
): readonly SimStatesChoiceRule[] {
  const declared = state["Choices"];

  if (!Array.isArray(declared) || declared.length === 0) {
    throw new SimStatesInvalidDefinition(
      `The Choice state ${stateName} carries no Choices. A Choice state ` +
        "needs at least one rule saying where the execution goes.",
    );
  }

  return declared.map((rule) => parseRule(stateName, rule));
}

/**
 * Check a `Choice` state's `Default`, the state it goes to when no rule holds.
 */
export function checkSimStatesChoiceDefault(
  stateName: string,
  state: Record<string, JSONValue>,
): void {
  const fallback = state["Default"];

  if (fallback === undefined) {
    return;
  }

  if (typeof fallback !== "string") {
    throw new SimStatesInvalidDefinition(
      `The Choice state ${stateName} has a Default that is not a state name.`,
    );
  }
}

/**
 * Read one top-level rule, which names where a match goes next.
 */
function parseRule(stateName: string, rule: JSONValue): SimStatesChoiceRule {
  const record = asSimStatesRuleRecord(stateName, rule);
  const next = record["Next"];

  if (typeof next !== "string") {
    throw new SimStatesInvalidDefinition(
      `A rule in the Choice state ${stateName} has no Next naming the state ` +
        "a match goes to.",
    );
  }

  return new SimStatesChoiceRule(
    parseSimStatesChoiceTest(stateName, record),
    next,
  );
}

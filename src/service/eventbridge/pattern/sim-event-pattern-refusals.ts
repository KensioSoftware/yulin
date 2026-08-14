import { SimEventBridgeInvalidEventPatternException } from "../error/sim-event-bridge.error.js";
import type { JSONValue } from "../../../util/type-guard/json.js";

/**
 * Refuse a pattern, in the shape real EventBridge words its refusals.
 */
export function eventPatternRefusal(
  reason: string,
): SimEventBridgeInvalidEventPatternException {
  return new SimEventBridgeInvalidEventPatternException(reason);
}

/**
 * Refuse an operator real EventBridge has and this simulation does not.
 *
 * Named rather than ignored, and refused rather than left never matching. A
 * pattern using `wildcard` that quietly matched nothing would look like a
 * pattern that was simply too specific, and the rule would go unnoticed until
 * the deployment.
 */
export function unsimulatedOperatorRefusal(
  operator: string,
): SimEventBridgeInvalidEventPatternException {
  return eventPatternRefusal(
    `the ${operator} operator is not simulated, so this pattern cannot be ` +
      `evaluated. Simulated EventBridge supports exact values, prefix, ` +
      `suffix, anything-but, numeric and exists.`,
  );
}

/**
 * Read the operand of a condition as the list it has to be.
 */
export function patternList(
  operand: JSONValue,
  operator: string,
): readonly JSONValue[] {
  if (!Array.isArray(operand)) {
    throw eventPatternRefusal(
      `${operator} match takes a list, and this one takes ${JSON.stringify(
        operand,
      )}`,
    );
  }

  return operand;
}

/**
 * Read the operand of a condition as the string it has to be.
 */
export function patternString(operand: JSONValue, operator: string): string {
  if (typeof operand !== "string") {
    throw eventPatternRefusal(
      `${operator} match compares against a string, and this one compares ` +
        `against ${JSON.stringify(operand)}`,
    );
  }

  return operand;
}

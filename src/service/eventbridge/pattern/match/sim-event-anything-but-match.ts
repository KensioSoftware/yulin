import type { JSONValue } from "../../../../util/type-guard/json.js";
import {
  eventPatternRefusal,
  unsimulatedOperatorRefusal,
} from "../sim-event-pattern-refusals.js";
import { SimEventPatternMatch } from "./sim-event-pattern-match.js";

/**
 * The operator name real EventBridge gives this match.
 */
export const eventPatternAnythingButOperator = "anything-but";

/**
 * The nested forms real EventBridge writes this operator in, which this
 * simulation does not evaluate.
 */
const nestedOperators = ["prefix", "suffix", "equals-ignore-case", "wildcard"];

/**
 * Read the values an anything-but condition excludes.
 *
 * A single value and a list of values are both written, and both mean the
 * same thing, so a single one becomes a list of one. The nested operator forms
 * are refused by name.
 */
function excludedIn(operand: JSONValue): readonly JSONValue[] {
  if (Array.isArray(operand)) {
    if (operand.length === 0) {
      throw eventPatternRefusal(
        `${eventPatternAnythingButOperator} match takes at least one value ` +
          `to exclude, and this one takes none`,
      );
    }

    return operand;
  }

  if (operand !== null && typeof operand === "object") {
    throw nestedFormRefusal(operand);
  }

  return [operand];
}

/**
 * Refuse an anything-but written with an operator inside it, naming that
 * operator where it is one EventBridge has.
 */
function nestedFormRefusal(operand: Record<string, JSONValue>): Error {
  const written = new Set(Object.keys(operand));
  const nested = nestedOperators.find((operator) => written.has(operator));

  return unsimulatedOperatorRefusal(
    `${eventPatternAnythingButOperator} with ${nested ?? "a nested operator"}`,
  );
}

/**
 * `{"anything-but": "initializing"}`, and the same with a list of values.
 *
 * The values are compared exactly, as they are for a plain value written in a
 * pattern, so excluding the string `"5"` does not exclude the number `5`.
 *
 * A field the event does not have is not matched by this. Real EventBridge
 * treats anything-but as a condition on a value, so a missing field fails it
 * rather than passing it for not being one of the excluded values.
 */
export class SimEventAnythingButMatch extends SimEventPatternMatch {
  private readonly excluded: readonly JSONValue[];

  constructor(excluded: readonly JSONValue[]) {
    super();
    this.excluded = excluded;
  }

  /**
   * Read an anything-but condition.
   */
  static of(operand: JSONValue): SimEventAnythingButMatch {
    return new this(excludedIn(operand));
  }

  /**
   * Whether a value the event carries is none of the excluded ones.
   */
  matchesValue(value: unknown): boolean {
    return this.excluded.every((excluded) => excluded !== value);
  }
}

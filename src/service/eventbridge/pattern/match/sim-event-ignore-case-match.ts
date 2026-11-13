import type { JSONValue } from "../../../../util/type-guard/json.js";
import { patternString } from "../sim-event-pattern-refusals.js";
import { SimEventPatternMatch } from "./sim-event-pattern-match.js";

/**
 * The operator name real EventBridge gives this match.
 */
export const eventPatternIgnoreCaseOperator = "equals-ignore-case";

/**
 * `{"equals-ignore-case": "orders.service"}`.
 *
 * It compares against a string, so it never matches a number or a boolean in
 * an event, here as on real AWS.
 */
export class SimEventIgnoreCaseMatch extends SimEventPatternMatch {
  private readonly expected: string;

  private constructor(expected: string) {
    super();
    this.expected = expected.toLowerCase();
  }

  /**
   * Read an `equals-ignore-case` condition.
   */
  static of(operand: JSONValue): SimEventIgnoreCaseMatch {
    return new this(patternString(operand, eventPatternIgnoreCaseOperator));
  }

  /**
   * Whether a value the event carries is the expected string in any case.
   */
  matchesValue(value: unknown): boolean {
    return typeof value === "string" && value.toLowerCase() === this.expected;
  }
}

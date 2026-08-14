import type { JSONValue } from "../../../../util/type-guard/json.js";
import {
  patternString,
  unsimulatedOperatorRefusal,
} from "../sim-event-pattern-refusals.js";
import { SimEventPatternMatch } from "./sim-event-pattern-match.js";

/**
 * The operator names real EventBridge gives these matches.
 */
export const eventPatternPrefixOperator = "prefix";
export const eventPatternSuffixOperator = "suffix";

/**
 * The case-insensitive form both operators can be written in, which this
 * simulation does not evaluate.
 */
const ignoreCaseOperator = "equals-ignore-case";

/**
 * `{"prefix": "us-"}` and `{"suffix": ".png"}`.
 *
 * The two are one class because they differ only in which end of the string
 * they read. Both compare against a string, so neither matches a number or a
 * boolean in an event, here as on real AWS.
 *
 * Real EventBridge also writes both with a nested `equals-ignore-case` operand
 * to compare regardless of case. That form is refused by name rather than
 * evaluated case-sensitively, which would silently answer a different question
 * from the one the pattern asked. Any other object operand is refused as
 * malformed rather than as that form, so the message says what is actually
 * wrong.
 */
export class SimEventAffixMatch extends SimEventPatternMatch {
  private readonly affix: string;
  private readonly atEnd: boolean;

  private constructor(affix: string, atEnd: boolean) {
    super();
    this.affix = affix;
    this.atEnd = atEnd;
  }

  /**
   * Read a `prefix` condition.
   */
  static prefix(operand: JSONValue): SimEventAffixMatch {
    return new this(this.affixIn(operand, eventPatternPrefixOperator), false);
  }

  /**
   * Read a `suffix` condition.
   */
  static suffix(operand: JSONValue): SimEventAffixMatch {
    return new this(this.affixIn(operand, eventPatternSuffixOperator), true);
  }

  /**
   * Read the string either operator compares against, refusing the
   * case-insensitive form.
   */
  private static affixIn(operand: JSONValue, operator: string): string {
    if (
      operand !== null &&
      typeof operand === "object" &&
      !Array.isArray(operand) &&
      Object.hasOwn(operand, ignoreCaseOperator)
    ) {
      throw unsimulatedOperatorRefusal(
        `${operator} with ${ignoreCaseOperator}`,
      );
    }

    return patternString(operand, operator);
  }

  /**
   * Whether a value the event carries is a string starting or ending with the
   * affix.
   */
  matchesValue(value: unknown): boolean {
    if (typeof value !== "string") {
      return false;
    }

    if (this.atEnd) {
      return value.endsWith(this.affix);
    }

    return value.startsWith(this.affix);
  }
}

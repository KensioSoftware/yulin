import type { JSONValue } from "../../../../util/type-guard/json.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import { patternString } from "../sim-event-pattern-refusals.js";
import { SimEventPatternMatch } from "./sim-event-pattern-match.js";

/**
 * The operator names real EventBridge gives these matches.
 */
export const eventPatternPrefixOperator = "prefix";
export const eventPatternSuffixOperator = "suffix";

/**
 * The case-insensitive form both operators can be written in.
 */
const ignoreCaseOperator = "equals-ignore-case";

/**
 * Read the string a `prefix` or `suffix` compares against, and whether it was
 * written in the case-insensitive form.
 */
function affixOperand(
  written: JSONValue,
  operator: string,
): { readonly affix: string; readonly ignoreCase: boolean } {
  if (!isRecord(written) || !Object.hasOwn(written, ignoreCaseOperator)) {
    return { affix: patternString(written, operator), ignoreCase: false };
  }

  const nested = new Map(Object.entries(written)).get(ignoreCaseOperator);

  return {
    affix: patternString(
      nested ?? null,
      `${operator} with ${ignoreCaseOperator}`,
    ),
    ignoreCase: true,
  };
}

/**
 * `{"prefix": "us-"}` and `{"suffix": ".png"}`.
 *
 * The two are one class because they differ only in which end of the string
 * they read. Both compare against a string, so neither matches a number or a
 * boolean in an event, here as on real AWS.
 *
 * Either can be written with a nested `equals-ignore-case` operand, such as
 * `{"prefix": {"equals-ignore-case": "us-"}}`, to compare regardless of case.
 * Any other object operand is refused as malformed.
 */
export class SimEventAffixMatch extends SimEventPatternMatch {
  private readonly affix: string;
  private readonly atEnd: boolean;
  private readonly ignoreCase: boolean;

  private constructor(written: JSONValue, operator: string, atEnd: boolean) {
    super();
    const { affix, ignoreCase } = affixOperand(written, operator);
    this.ignoreCase = ignoreCase;
    this.affix = ignoreCase ? affix.toLowerCase() : affix;
    this.atEnd = atEnd;
  }

  /**
   * Read a `prefix` condition.
   */
  static prefix(operand: JSONValue): SimEventAffixMatch {
    return new this(operand, eventPatternPrefixOperator, false);
  }

  /**
   * Read a `suffix` condition.
   */
  static suffix(operand: JSONValue): SimEventAffixMatch {
    return new this(operand, eventPatternSuffixOperator, true);
  }

  /**
   * Whether a value the event carries is a string starting or ending with the
   * affix.
   */
  matchesValue(value: unknown): boolean {
    if (typeof value !== "string") {
      return false;
    }

    const compared = this.ignoreCase ? value.toLowerCase() : value;

    return this.atEnd
      ? compared.endsWith(this.affix)
      : compared.startsWith(this.affix);
  }
}

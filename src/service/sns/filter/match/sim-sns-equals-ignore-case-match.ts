import type { JSONValue } from "../../../../util/type-guard/json.js";
import { filterPolicyText } from "../sim-sns-filter-refusals.js";
import type { SimSnsFilterValue } from "../sim-sns-filter-value.js";
import { SimSnsFilterMatch } from "./sim-sns-filter-match.js";

/**
 * The operator name real SNS gives this match.
 */
export const simSnsEqualsIgnoreCaseOperator = "equals-ignore-case";

/**
 * `{"equals-ignore-case": "Order"}`, which is the one string match that is not
 * case sensitive.
 */
export class SimSnsEqualsIgnoreCaseMatch extends SimSnsFilterMatch {
  private readonly lowerCased: string;

  constructor(expected: string) {
    super();
    this.lowerCased = expected.toLowerCase();
  }

  /**
   * Read the text this match is written with.
   */
  static of(operand: JSONValue): SimSnsEqualsIgnoreCaseMatch {
    return new this(filterPolicyText(operand, simSnsEqualsIgnoreCaseOperator));
  }

  /**
   * Whether the value is the text the policy named, in any case.
   */
  matchesValue(value: SimSnsFilterValue): boolean {
    return value.text?.toLowerCase() === this.lowerCased;
  }
}

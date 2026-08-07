import type { JSONValue } from "../../../../util/type-guard/json.js";
import { filterPolicyText } from "../sim-sns-filter-refusals.js";
import type { SimSnsFilterValue } from "../sim-sns-filter-value.js";
import { SimSnsFilterMatch } from "./sim-sns-filter-match.js";

/**
 * The operator name real SNS gives this match.
 */
export const simSnsSuffixOperator = "suffix";

/**
 * `{"suffix": ".csv"}`, which matches on the end of the value.
 */
export class SimSnsSuffixMatch extends SimSnsFilterMatch {
  private readonly suffix: string;

  constructor(suffix: string) {
    super();
    this.suffix = suffix;
  }

  /**
   * Read the text a suffix match is written with.
   */
  static of(operand: JSONValue): SimSnsSuffixMatch {
    return new this(filterPolicyText(operand, simSnsSuffixOperator));
  }

  /**
   * Whether the value ends with the text the policy named.
   */
  matchesValue(value: SimSnsFilterValue): boolean {
    return value.text?.endsWith(this.suffix) === true;
  }
}

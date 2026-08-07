import type { JSONValue } from "../../../../util/type-guard/json.js";
import { filterPolicyText } from "../sim-sns-filter-refusals.js";
import type { SimSnsFilterValue } from "../sim-sns-filter-value.js";
import { SimSnsFilterMatch } from "./sim-sns-filter-match.js";

/**
 * The operator name real SNS gives this match.
 */
export const simSnsPrefixOperator = "prefix";

/**
 * `{"prefix": "order-"}`, which matches on the start of the value.
 *
 * Only text has a start, so a numeric value matches no prefix. That is what a
 * message body holding a JSON number rather than a string runs into.
 */
export class SimSnsPrefixMatch extends SimSnsFilterMatch {
  private readonly prefix: string;

  constructor(prefix: string) {
    super();
    this.prefix = prefix;
  }

  /**
   * Read the text a prefix match is written with.
   */
  static of(operand: JSONValue): SimSnsPrefixMatch {
    return new this(filterPolicyText(operand, simSnsPrefixOperator));
  }

  /**
   * Whether the value starts with the text the policy named.
   */
  matchesValue(value: SimSnsFilterValue): boolean {
    return value.text?.startsWith(this.prefix) === true;
  }
}

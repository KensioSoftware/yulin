import type { JSONValue } from "../../../../util/type-guard/json.js";
import { simSnsFilterPolicyRefusal } from "../sim-sns-filter-refusals.js";
import { SimSnsFilterValue } from "../sim-sns-filter-value.js";
import { SimSnsFilterMatch } from "./sim-sns-filter-match.js";

/**
 * Read a scalar a policy was written with as the value it means.
 *
 * A list or an object is not a value: a list at this position would be a list
 * of match conditions inside a list of match conditions, which real SNS has no
 * meaning for, and an object is an operator handled elsewhere.
 */
function exactValue(written: JSONValue): SimSnsFilterValue {
  if (typeof written === "string") {
    return SimSnsFilterValue.ofText(written);
  }

  if (typeof written === "number") {
    return SimSnsFilterValue.ofNumber(written);
  }

  if (typeof written === "boolean") {
    return SimSnsFilterValue.ofBoolean(written);
  }

  throw simSnsFilterPolicyRefusal(
    `a match condition is a string, a number, a boolean or an operator, and ` +
      `this one is ${JSON.stringify(written)}`,
  );
}

/**
 * The value a policy names on its own, with no operator around it.
 *
 * This is the plain form: `{"type": ["order"]}` matches a `type` of `order` and
 * nothing else. String matching is case sensitive, as it is on real SNS.
 */
export class SimSnsExactMatch extends SimSnsFilterMatch {
  private readonly expected: SimSnsFilterValue;

  constructor(expected: SimSnsFilterValue) {
    super();
    this.expected = expected;
  }

  /**
   * Read one scalar of a policy as the value it has to equal.
   */
  static of(written: JSONValue): SimSnsExactMatch {
    return new this(exactValue(written));
  }

  /**
   * Whether the value is the one the policy named.
   */
  matchesValue(value: SimSnsFilterValue): boolean {
    return this.expected.equals(value);
  }
}

import type { JSONValue } from "../../../../util/type-guard/json.js";
import { simSnsFilterPolicyRefusal } from "../sim-sns-filter-refusals.js";
import { SimSnsFilterMatch } from "./sim-sns-filter-match.js";

/**
 * The operator name real SNS gives this match.
 */
export const simSnsExistsOperator = "exists";

/**
 * `{"exists": true}`, which asks about the key rather than the value.
 *
 * This is the one operator with anything to say about a key the message does
 * not carry: `{"exists": false}` matches exactly that, and every other operator
 * matches nothing when there is no value to look at.
 */
export class SimSnsExistsMatch extends SimSnsFilterMatch {
  public override readonly matchesAbsence: boolean;

  private readonly required: boolean;

  constructor(required: boolean) {
    super();
    this.required = required;
    this.matchesAbsence = !required;
  }

  /**
   * Read whether the policy asks for the key to be there or to be missing.
   */
  static of(operand: JSONValue): SimSnsExistsMatch {
    if (typeof operand !== "boolean") {
      throw simSnsFilterPolicyRefusal(
        `exists match is true or false, and this one is ${JSON.stringify(
          operand,
        )}`,
      );
    }

    return new this(operand);
  }

  /**
   * Whether a value being there is what the policy asked for.
   */
  matchesValue(): boolean {
    return this.required;
  }
}

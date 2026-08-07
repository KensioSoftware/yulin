import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimSnsFilterMatch } from "./match/sim-sns-filter-match.js";
import { simSnsFilterMatchOf } from "./sim-sns-filter-matches.js";
import { simSnsFilterPolicyRefusal } from "./sim-sns-filter-refusals.js";
import type { SimSnsFilterRule } from "./sim-sns-filter-rule.js";
import type { SimSnsFilterSubject } from "./sim-sns-filter-subject.js";

/**
 * One key of a filter policy and the match conditions it holds.
 *
 * The list is read as an OR, which is what makes `{"type": ["order",
 * "refund"]}` a rule about two kinds of message rather than a message that is
 * somehow both.
 */
export class SimSnsFilterKeyRule implements SimSnsFilterRule {
  private readonly path: readonly string[];
  private readonly conditions: readonly SimSnsFilterMatch[];

  private constructor(
    path: readonly string[],
    conditions: readonly SimSnsFilterMatch[],
  ) {
    this.path = path;
    this.conditions = conditions;
  }

  /**
   * Read the list of match conditions a key holds.
   *
   * An empty list is refused rather than taken as a rule nothing satisfies. A
   * policy that matched no message at all would be indistinguishable from one
   * whose messages never turned up.
   */
  static of(
    path: readonly string[],
    written: readonly JSONValue[],
  ): SimSnsFilterKeyRule {
    if (written.length === 0) {
      throw simSnsFilterPolicyRefusal(
        `${path.join(".")} holds no match conditions, so nothing could match it`,
      );
    }

    return new this(
      path,
      written.map((condition) => simSnsFilterMatchOf(condition)),
    );
  }

  /**
   * Whether any of this key's match conditions holds for the message.
   */
  matches(subject: SimSnsFilterSubject): boolean {
    const values = subject.valuesAt(this.path);

    // A key the message does not carry is only matched by the operator that
    // asks for it to be missing. A key holding several values, as a
    // String.Array attribute or a JSON array does, is matched by any of them.
    if (values.length === 0) {
      return this.conditions.some((condition) => condition.matchesAbsence);
    }

    return this.conditions.some((condition) =>
      values.some((value) => condition.matchesValue(value)),
    );
  }
}

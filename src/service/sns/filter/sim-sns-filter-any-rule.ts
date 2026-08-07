import type { SimSnsFilterRule } from "./sim-sns-filter-rule.js";
import type { SimSnsFilterSubject } from "./sim-sns-filter-subject.js";

/**
 * An `$or` across separate keys, which matches when any of its sides does.
 *
 * Each side is a policy of its own, so `{"$or": [{"type": ["order"]}, {"kind":
 * ["refund"]}]}` matches a message carrying either key. Everything else in a
 * policy is an and, which is why this needs a key of its own to express.
 *
 * Whether an `$or` is one at all is decided before this is built, in
 * `sim-sns-filter-or-eligibility.ts`.
 */
export class SimSnsFilterAnyRule implements SimSnsFilterRule {
  private readonly alternatives: readonly SimSnsFilterRule[];

  constructor(alternatives: readonly SimSnsFilterRule[]) {
    this.alternatives = alternatives;
  }

  /**
   * Whether the message satisfies any one of the alternatives.
   */
  matches(subject: SimSnsFilterSubject): boolean {
    return this.alternatives.some((alternative) =>
      alternative.matches(subject),
    );
  }
}

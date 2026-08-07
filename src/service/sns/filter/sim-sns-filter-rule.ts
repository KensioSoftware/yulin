import type { SimSnsFilterSubject } from "./sim-sns-filter-subject.js";

/**
 * One thing a filter policy requires of a message.
 *
 * A policy is a set of these, all of which have to hold. There are three: a key
 * with its match conditions, a nested set of rules under a key of a message
 * body, and an `$or` of alternatives.
 */
export interface SimSnsFilterRule {
  /**
   * Whether the message satisfies this rule.
   */
  matches(subject: SimSnsFilterSubject): boolean;
}

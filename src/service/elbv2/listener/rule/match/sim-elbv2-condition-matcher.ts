import type { SimElbV2MatchableRequest } from "./sim-elbv2-matchable-request.js";
import type { SimElbV2WildcardPattern } from "./sim-elbv2-wildcard-pattern.js";

/**
 * Decides whether one condition on a rule claims a request.
 *
 * There is one implementation per simulated condition field, so nothing has to
 * branch on which field a condition was written on once the rule exists.
 */
export interface SimElbV2ConditionMatcher {
  /**
   * Whether this condition is satisfied by a request.
   */
  matches(request: SimElbV2MatchableRequest): boolean;
}

/**
 * A condition matching one part of a request against a list of patterns.
 *
 * A condition with several values is satisfied when any one of them matches,
 * which is what makes a value list an or and several conditions on a rule an
 * and. Each subclass says which part of the request its field compares.
 */
export abstract class SimElbV2ValueListMatcher implements SimElbV2ConditionMatcher {
  protected constructor(
    private readonly patterns: readonly SimElbV2WildcardPattern[],
  ) {}

  matches(request: SimElbV2MatchableRequest): boolean {
    const subject = this.subject(request);

    return this.patterns.some((pattern) => pattern.matches(subject));
  }

  /**
   * The part of the request this field compares its values against.
   */
  protected abstract subject(request: SimElbV2MatchableRequest): string;
}

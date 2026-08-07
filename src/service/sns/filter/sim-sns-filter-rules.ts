import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { SimSnsFilterAnyRule } from "./sim-sns-filter-any-rule.js";
import { SimSnsFilterKeyRule } from "./sim-sns-filter-key-rule.js";
import {
  simSnsOrAlternatives,
  simSnsOrKey,
} from "./sim-sns-filter-or-eligibility.js";
import type { SimSnsFilterPolicyScope } from "./sim-sns-filter-policy-scope.js";
import {
  isFilterPolicyObject,
  simSnsFilterPolicyRefusal,
} from "./sim-sns-filter-refusals.js";
import type { SimSnsFilterRule } from "./sim-sns-filter-rule.js";
import type { SimSnsFilterSubject } from "./sim-sns-filter-subject.js";

/**
 * Every key of a filter policy, all of which have to match.
 *
 * This is a rule itself as well as a set of them, because a nested key of a
 * message body holds another set: `{"customer": {"tier": ["gold"]}}` is a rule
 * about `customer` whose content is the same thing one level down.
 */
export class SimSnsFilterRules implements SimSnsFilterRule {
  private readonly rules: readonly SimSnsFilterRule[];

  private constructor(rules: readonly SimSnsFilterRule[]) {
    this.rules = rules;
  }

  /**
   * Read one level of a filter policy document.
   *
   * The path is where this level sits in the document, which is what a nested
   * policy is: the key it was nested under, then the key it names.
   */
  static of(
    document: JSONObject,
    path: readonly string[],
    scope: SimSnsFilterPolicyScope,
  ): SimSnsFilterRules {
    return new this(
      Object.entries(document).map(([key, value]) =>
        ruleOf(key, value, path, scope),
      ),
    );
  }

  /**
   * Whether the message satisfies every key of this level.
   */
  matches(subject: SimSnsFilterSubject): boolean {
    return this.rules.every((rule) => rule.matches(subject));
  }
}

/**
 * Read one key of a policy as the rule it states.
 *
 * A list is the match conditions for that key, an object is a nested key, and
 * `$or` is neither: it names alternatives rather than a key of the message.
 */
function ruleOf(
  key: string,
  written: JSONValue,
  path: readonly string[],
  scope: SimSnsFilterPolicyScope,
): SimSnsFilterRule {
  if (key === simSnsOrKey) {
    return new SimSnsFilterAnyRule(
      simSnsOrAlternatives(written).map((alternative) =>
        SimSnsFilterRules.of(alternative, path, scope),
      ),
    );
  }

  if (Array.isArray(written)) {
    return SimSnsFilterKeyRule.of([...path, key], written);
  }

  if (isFilterPolicyObject(written)) {
    return nestedRules(key, written, path, scope);
  }

  throw simSnsFilterPolicyRefusal(
    `${[...path, key].join(".")} holds a list of match conditions, and this ` +
      `one holds ${JSON.stringify(written)}`,
  );
}

/**
 * Read a nested key, which only a message body has.
 *
 * Message attributes are a flat set of names, so a policy nesting under that
 * scope names a key no message could carry. It is refused when the policy is
 * set rather than left to match nothing.
 */
function nestedRules(
  key: string,
  written: JSONObject,
  path: readonly string[],
  scope: SimSnsFilterPolicyScope,
): SimSnsFilterRules {
  if (!scope.allowsNestedKeys) {
    throw simSnsFilterPolicyRefusal(
      `${[...path, key].join(".")} is a nested key, and a policy of the ` +
        `${scope.value} scope matches a flat set of message attributes`,
    );
  }

  return SimSnsFilterRules.of(written, [...path, key], scope);
}

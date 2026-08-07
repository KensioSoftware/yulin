import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import type { SimSnsPublishedMessage } from "../message/sim-sns-published-message.js";
import type { SimSnsFilterPolicyScope } from "./sim-sns-filter-policy-scope.js";
import {
  isFilterPolicyObject,
  simSnsFilterPolicyRefusal,
} from "./sim-sns-filter-refusals.js";
import { SimSnsFilterRules } from "./sim-sns-filter-rules.js";

/**
 * Read the `FilterPolicy` attribute of a request as the document it has to be.
 */
function documentIn(value: string): JSONObject {
  const parsed = parsedJson(value);

  if (!isFilterPolicyObject(parsed)) {
    throw simSnsFilterPolicyRefusal(
      `a filter policy is a JSON object of keys and their match conditions, ` +
        `and this one is ${JSON.stringify(parsed)}`,
    );
  }

  return parsed;
}

function parsedJson(value: string): JSONValue {
  try {
    return JSON.parse(value) as JSONValue;
  } catch {
    throw simSnsFilterPolicyRefusal(
      `${JSON.stringify(value)} is not a JSON document`,
    );
  }
}

interface SimSnsFilterPolicyProperties {
  readonly value: string;
  readonly scope: SimSnsFilterPolicyScope;
  readonly rules: SimSnsFilterRules;
}

/**
 * The filter policy of one simulated subscription.
 *
 * A published message reaches the subscription only when the policy matches, so
 * this is what makes a topic with several subscribers something a test can say
 * anything about: a subscriber receiving nothing is a policy that did not
 * match, rather than a delivery that went missing.
 *
 * The whole policy is read when it is set. An operator this simulation cannot
 * apply is refused there rather than when a message arrives, because a policy
 * accepted and then matching nothing looks exactly like filtering that worked.
 *
 * The string the policy was set with is kept, so `GetSubscriptionAttributes`
 * reports back what was set rather than a re-serialised version of it.
 */
export class SimSnsFilterPolicy {
  public readonly value: string;
  public readonly scope: SimSnsFilterPolicyScope;

  private readonly rules: SimSnsFilterRules;

  private constructor(properties: SimSnsFilterPolicyProperties) {
    this.value = properties.value;
    this.scope = properties.scope;
    this.rules = properties.rules;
  }

  /**
   * Read a filter policy for the scope it will be matched under.
   *
   * The scope is part of reading it rather than part of matching with it,
   * because it decides what the document may say: only a policy of the
   * `MessageBody` scope can nest.
   */
  static parse(
    value: string,
    scope: SimSnsFilterPolicyScope,
  ): SimSnsFilterPolicy {
    return new this({
      value,
      scope,
      rules: SimSnsFilterRules.of(documentIn(value), [], scope),
    });
  }

  /**
   * Whether a published message satisfies this policy.
   *
   * Every key of the policy has to match, and each key matches when any of its
   * match conditions does.
   */
  matches(message: SimSnsPublishedMessage): boolean {
    return this.rules.matches(this.scope.subjectOf(message));
  }

  /**
   * This policy read again for another scope.
   *
   * Setting `FilterPolicyScope` on a subscription that already holds a policy
   * changes what that policy is matched against, so it is read again under the
   * new scope. A policy that cannot be written under the new scope is refused
   * then, rather than left in place matching nothing.
   */
  forScope(scope: SimSnsFilterPolicyScope): SimSnsFilterPolicy {
    if (scope === this.scope) {
      return this;
    }

    return SimSnsFilterPolicy.parse(this.value, scope);
  }
}

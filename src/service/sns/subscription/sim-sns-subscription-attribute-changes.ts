import { SimSnsFilterPolicy } from "../filter/sim-sns-filter-policy.js";
import {
  type SimSnsFilterPolicyScope,
  simSnsFilterPolicyScopeOf,
} from "../filter/sim-sns-filter-policy-scope.js";
import {
  SimSnsRequestedSubscriptionAttributes,
  type SimSnsSubscriptionAttributeInput,
} from "./sim-sns-requested-subscription-attributes.js";
import {
  simSnsFilterPolicyAttributeName,
  simSnsFilterPolicyScopeAttributeName,
  simSnsRawMessageDeliveryAttributeName,
} from "./sim-sns-subscription-attribute-names.js";

/**
 * What one subscription's settable attributes are set to.
 */
export interface SimSnsSubscriptionAttributeValues {
  readonly rawMessageDelivery: boolean;
  readonly filterPolicy: SimSnsFilterPolicy | undefined;
  readonly filterPolicyScope: SimSnsFilterPolicyScope;
}

/**
 * The scope the subscription ends up with.
 *
 * An empty value is how an attribute is cleared, which puts the subscription
 * back on the default scope.
 */
function changedScope(
  held: SimSnsSubscriptionAttributeValues,
  named: SimSnsRequestedSubscriptionAttributes,
): SimSnsFilterPolicyScope {
  const value = named.value(simSnsFilterPolicyScopeAttributeName);

  if (value === undefined) {
    return held.filterPolicyScope;
  }

  return simSnsFilterPolicyScopeOf(value);
}

/**
 * The policy the subscription ends up with.
 *
 * An empty value takes the policy off the subscription, which puts it back to
 * receiving everything its topic publishes. A policy already held is read again
 * when the scope changes, since the scope decides what a policy may say.
 */
function changedPolicy(
  held: SimSnsSubscriptionAttributeValues,
  named: SimSnsRequestedSubscriptionAttributes,
  scope: SimSnsFilterPolicyScope,
): SimSnsFilterPolicy | undefined {
  const value = named.value(simSnsFilterPolicyAttributeName);

  if (value === undefined) {
    return held.filterPolicy?.forScope(scope);
  }

  if (value === "") {
    return undefined;
  }

  return SimSnsFilterPolicy.parse(value, scope);
}

/**
 * Read a request as the attributes it leaves the subscription with.
 *
 * Every attribute the request left out keeps the value it had, and every name
 * is checked before any value is read, so a request naming one attribute this
 * simulation will not take changes none of them.
 */
export function simSnsChangedSubscriptionAttributes(
  held: SimSnsSubscriptionAttributeValues,
  requested: SimSnsSubscriptionAttributeInput,
): SimSnsSubscriptionAttributeValues {
  const named = new SimSnsRequestedSubscriptionAttributes(requested);
  const scope = changedScope(held, named);

  return {
    rawMessageDelivery:
      named.booleanValue(simSnsRawMessageDeliveryAttributeName) ??
      held.rawMessageDelivery,
    filterPolicy: changedPolicy(held, named, scope),
    filterPolicyScope: scope,
  };
}

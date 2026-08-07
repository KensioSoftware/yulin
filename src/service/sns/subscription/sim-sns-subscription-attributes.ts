import type { SimSnsFilterPolicy } from "../filter/sim-sns-filter-policy.js";
import {
  simSnsDefaultFilterPolicyScope,
  type SimSnsFilterPolicyScope,
} from "../filter/sim-sns-filter-policy-scope.js";
import type { SimSnsPublishedMessage } from "../message/sim-sns-published-message.js";
import type { SimSnsSubscriptionAttributeInput } from "./sim-sns-requested-subscription-attributes.js";
import {
  simSnsChangedSubscriptionAttributes,
  type SimSnsSubscriptionAttributeValues,
} from "./sim-sns-subscription-attribute-changes.js";
import {
  simSnsFilterPolicyAttributeName,
  simSnsFilterPolicyScopeAttributeName,
  simSnsRawMessageDeliveryAttributeName,
} from "./sim-sns-subscription-attribute-names.js";

/**
 * The attributes of one simulated subscription that a request can set.
 *
 * Applying a request makes a new set rather than changing this one, so a
 * request naming an attribute this simulation will not take leaves the
 * subscription as it was.
 */
export class SimSnsSubscriptionAttributes {
  public readonly rawMessageDelivery: boolean;
  public readonly filterPolicy: SimSnsFilterPolicy | undefined;
  public readonly filterPolicyScope: SimSnsFilterPolicyScope;

  private constructor(values: SimSnsSubscriptionAttributeValues) {
    this.rawMessageDelivery = values.rawMessageDelivery;
    this.filterPolicy = values.filterPolicy;
    this.filterPolicyScope = values.filterPolicyScope;
  }

  /**
   * The attributes a subscription has before anything sets one.
   *
   * Real SNS reports `RawMessageDelivery` as false for a subscription created
   * without it, rather than leaving the attribute out, which is why it is held
   * rather than being absent until set. A subscription holds no filter policy
   * until one is set, and receives everything its topic publishes.
   */
  static defaults(): SimSnsSubscriptionAttributes {
    return new this({
      rawMessageDelivery: false,
      filterPolicy: undefined,
      filterPolicyScope: simSnsDefaultFilterPolicyScope,
    });
  }

  /**
   * These attributes with a request's changes applied.
   */
  with(
    requested: SimSnsSubscriptionAttributeInput,
  ): SimSnsSubscriptionAttributes {
    return new SimSnsSubscriptionAttributes(
      simSnsChangedSubscriptionAttributes(this, requested),
    );
  }

  /**
   * Whether this subscription's filter policy admits a published message.
   *
   * A subscription with no policy takes everything its topic publishes, which
   * is what a subscription without one does on real SNS.
   */
  accepts(message: SimSnsPublishedMessage): boolean {
    return this.filterPolicy?.matches(message) ?? true;
  }

  /**
   * Add these attributes to what SNS reports about the subscription.
   *
   * The two filter policy attributes are reported only when there is a policy,
   * as real SNS reports them. A subscription that filters nothing has no scope
   * to report either, since the scope only says how a policy is read.
   */
  reportInto(reported: Map<string, string>): void {
    reported.set(
      simSnsRawMessageDeliveryAttributeName,
      String(this.rawMessageDelivery),
    );

    if (this.filterPolicy === undefined) {
      return;
    }

    reported.set(simSnsFilterPolicyAttributeName, this.filterPolicy.value);
    reported.set(
      simSnsFilterPolicyScopeAttributeName,
      this.filterPolicyScope.value,
    );
  }
}

export { type SimSnsSubscriptionAttributeInput } from "./sim-sns-requested-subscription-attributes.js";

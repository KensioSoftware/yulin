import type { SimSnsSubscription } from "../../../../sns/subscription/sim-sns-subscription.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimSnsSubscriptionCfnProperties {
  readonly subscription: SimSnsSubscription;
}

/**
 * CloudFormation-facing values for a simulated SNS subscription.
 */
export class SimSnsSubscriptionCfn implements SimCfnResourceValueAdapter {
  private readonly subscription: SimSnsSubscription;

  constructor(properties: SimSnsSubscriptionCfnProperties) {
    this.subscription = properties.subscription;
  }

  /**
   * AWS::SNS::Subscription Ref returns the subscription ARN.
   */
  refValue(): SimCfnTemplateValue {
    return this.subscription.arn.value;
  }

  /**
   * AWS::SNS::Subscription attributes.
   *
   * `Arn` is the only one, and it is the same string the Ref gives, since the
   * subscription ARN is the Resource's physical id. Everything else a template
   * could ask for about a subscription is something it wrote itself.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Arn") {
      return this.subscription.arn.value;
    }

    throw new Error(
      `Unsupported AWS::SNS::Subscription attribute ${attributeName}`,
    );
  }
}

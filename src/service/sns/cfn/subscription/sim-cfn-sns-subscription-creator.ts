import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSns } from "../../sim-sns.js";
import type { SimSnsSubscription } from "../../subscription/sim-sns-subscription.js";
import { simCfnSnsResourceCreation } from "../sim-cfn-sns-resource-error.js";
import { snsSubscriptionResourceType } from "../sim-cfn-sns-resource-types.js";
import { SimCfnSnsSubscriptionProperties } from "./sim-cfn-sns-subscription-properties.js";

interface SimCfnSnsSubscriptionCreatorProperties {
  readonly sns: SimSns;
}

/**
 * Creates simulated subscriptions from AWS::SNS::Subscription Resources.
 *
 * This is what CDK emits for `topic.addSubscription(...)`, alongside whatever
 * lets the delivery through: an AWS::SQS::QueuePolicy for a queue, an
 * AWS::Lambda::Permission for a function. The subscription goes through the
 * ordinary Subscribe command, so the endpoint has to be one the protocol can
 * reach and the filter policy is read exactly as one set through the SDK is.
 */
export class SimCfnSnsSubscriptionCreator {
  private readonly sns: SimSns;

  constructor(properties: SimCfnSnsSubscriptionCreatorProperties) {
    this.sns = properties.sns;
  }

  /**
   * Create a subscription from an AWS::SNS::Subscription Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimSnsSubscription> {
    const input = new SimCfnSnsSubscriptionProperties({
      resource,
      properties,
    }).input();

    return simCfnSnsResourceCreation(
      snsSubscriptionResourceType,
      resource.logicalId,
      async () => {
        const subscribed = await this.sns.subscribe({ input });

        const arn = subscribed.SubscriptionArn;
        assertDefined(
          arn,
          `sim SNS subscription ARN after CloudFormation creation of ${resource.logicalId}`,
        );

        const subscription = this.sns.findSubscription(arn);
        assertDefined(subscription, `sim SNS subscription ${arn}`);

        return subscription;
      },
    );
  }
}

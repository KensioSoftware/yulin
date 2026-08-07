import { SimSnsSubscription } from "../../../../sns/subscription/sim-sns-subscription.js";
import { SimSnsTopic } from "../../../../sns/topic/sim-sns-topic.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimSnsSubscriptionCfn } from "./sim-sns-subscription-cfn.js";
import { SimSnsTopicCfn } from "./sim-sns-topic-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated SNS Resource.
 *
 * An AWS::SNS::TopicPolicy is backed by one of the topics it names, since a
 * topic policy is nothing but an attribute of those topics. It is not claimed
 * here, so it falls through to the default adapter and answers a Ref with its
 * logical ID rather than with a topic ARN that belongs to another Resource.
 */
export function snsValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::SNS::Topic" &&
    properties.simResource instanceof SimSnsTopic
  ) {
    return new SimSnsTopicCfn({ topic: properties.simResource });
  }

  if (
    properties.type === "AWS::SNS::Subscription" &&
    properties.simResource instanceof SimSnsSubscription
  ) {
    return new SimSnsSubscriptionCfn({ subscription: properties.simResource });
  }

  return undefined;
}

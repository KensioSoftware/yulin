import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimSnsSubscriptionAttributeInput } from "../../subscription/sim-sns-subscription-attributes.js";

/**
 * One subscription in a listing response.
 */
export interface SimSnsListedSubscription {
  readonly SubscriptionArn: string;
  readonly Owner: string;
  readonly Protocol: string;
  readonly Endpoint: string;
  readonly TopicArn: string;
}

/**
 * Minimal structural sim SNS Subscribe command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/SubscribeCommand/
 */
export interface SimSubscribeCommand {
  readonly input: SimSubscribeCommandInput;
}

export interface SimSubscribeCommandInput {
  readonly TopicArn?: string | undefined;
  readonly Protocol?: string | undefined;
  readonly Endpoint?: string | undefined;
  readonly Attributes?: SimSnsSubscriptionAttributeInput | undefined;

  /**
   * Whether the response carries the subscription ARN before the subscription
   * is confirmed.
   *
   * It changes nothing here. The only protocol simulated is the one real SNS
   * confirms itself, so a subscription is confirmed as soon as it exists and
   * its ARN comes back either way.
   */
  readonly ReturnSubscriptionArn?: boolean | undefined;
}

export interface SimSubscribeCommandOutput {
  readonly SubscriptionArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS Unsubscribe command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/UnsubscribeCommand/
 */
export interface SimUnsubscribeCommand {
  readonly input: SimUnsubscribeCommandInput;
}

export interface SimUnsubscribeCommandInput {
  readonly SubscriptionArn?: string | undefined;
}

export interface SimUnsubscribeCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS ListSubscriptions command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/ListSubscriptionsCommand/
 */
export interface SimListSubscriptionsCommand {
  readonly input: SimListSubscriptionsCommandInput;
}

export interface SimListSubscriptionsCommandInput {
  readonly NextToken?: string | undefined;
}

export interface SimListSubscriptionsCommandOutput {
  readonly Subscriptions?: readonly SimSnsListedSubscription[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS ListSubscriptionsByTopic command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/ListSubscriptionsByTopicCommand/
 */
export interface SimListSubscriptionsByTopicCommand {
  readonly input: SimListSubscriptionsByTopicCommandInput;
}

export interface SimListSubscriptionsByTopicCommandInput {
  readonly TopicArn?: string | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListSubscriptionsByTopicCommandOutput {
  readonly Subscriptions?: readonly SimSnsListedSubscription[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS GetSubscriptionAttributes command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/GetSubscriptionAttributesCommand/
 */
export interface SimGetSubscriptionAttributesCommand {
  readonly input: SimGetSubscriptionAttributesCommandInput;
}

export interface SimGetSubscriptionAttributesCommandInput {
  readonly SubscriptionArn?: string | undefined;
}

export interface SimGetSubscriptionAttributesCommandOutput {
  readonly Attributes?: Record<string, string> | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SNS SetSubscriptionAttributes command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/SetSubscriptionAttributesCommand/
 */
export interface SimSetSubscriptionAttributesCommand {
  readonly input: SimSetSubscriptionAttributesCommandInput;
}

export interface SimSetSubscriptionAttributesCommandInput {
  readonly SubscriptionArn?: string | undefined;
  readonly AttributeName?: string | undefined;
  readonly AttributeValue?: string | undefined;
}

export interface SimSetSubscriptionAttributesCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

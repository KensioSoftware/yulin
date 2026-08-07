import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimSnsTopicArn } from "./sim-sns-topic-arn.js";
import type {
  SimSnsTopicAttributeInput,
  SimSnsTopicAttributes,
} from "./sim-sns-topic-attributes.js";
import type { SimSnsTopicName } from "./sim-sns-topic-name.js";

/**
 * The attribute naming the topic itself, which is the ARN a request reaches it
 * by.
 */
const topicArnAttributeName = "TopicArn";

/**
 * The attribute naming the Account that owns the topic.
 */
const ownerAttributeName = "Owner";

/**
 * The subscription counts real SNS reports on every topic.
 *
 * They are reported here because a topic with no subscriptions really does have
 * none of each, which is the only kind of topic this simulation has yet.
 */
const subscriptionCountAttributeNames = [
  "SubscriptionsConfirmed",
  "SubscriptionsPending",
  "SubscriptionsDeleted",
];

interface SimSnsTopicProperties {
  readonly name: SimSnsTopicName;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly attributes: SimSnsTopicAttributes;
}

/**
 * One simulated standard topic.
 *
 * A topic holds almost nothing: its name, the ARN that name implies, and the
 * attributes a request has set. Publishing to it changes none of that, because
 * a topic keeps no messages. What a message reaches is the topic's
 * subscriptions, and those are not simulated yet.
 */
export class SimSnsTopic {
  public readonly name: SimSnsTopicName;
  public readonly arn: SimSnsTopicArn;

  private readonly owner: string;
  private held: SimSnsTopicAttributes;

  constructor(properties: SimSnsTopicProperties) {
    this.name = properties.name;
    this.arn = new SimSnsTopicArn({
      name: properties.name,
      accountRegionScope: properties.accountRegionScope,
    });
    this.owner = properties.accountRegionScope.accountId;
    this.held = properties.attributes;
  }

  /**
   * The attributes this topic currently holds.
   */
  get attributes(): SimSnsTopicAttributes {
    return this.held;
  }

  /**
   * Apply the attributes a request names, refusing any this simulation will not
   * take.
   */
  applyAttributes(requested: SimSnsTopicAttributeInput): void {
    this.held = this.held.with(requested);
  }

  /**
   * This topic as GetTopicAttributes reports it.
   *
   * Real SNS reports every attribute a topic has rather than only the ones a
   * request asked for, since a GetTopicAttributes request names no attributes.
   */
  reportedAttributes(): Record<string, string> {
    const reported = new Map<string, string>([
      [topicArnAttributeName, this.arn.value],
      [ownerAttributeName, this.owner],
    ]);

    for (const name of subscriptionCountAttributeNames) {
      reported.set(name, "0");
    }

    this.held.reportInto(reported);

    return Object.fromEntries(reported);
  }
}

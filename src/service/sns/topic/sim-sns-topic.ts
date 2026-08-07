import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimSnsSubscriptionCounts } from "../subscription/sim-sns-subscription-store.js";
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
 * Nothing is ever pending, because the only subscription protocol simulated is
 * the one real SNS confirms itself.
 */
function subscriptionCountAttributes(
  counts: SimSnsSubscriptionCounts,
): readonly (readonly [string, string])[] {
  return [
    ["SubscriptionsConfirmed", String(counts.confirmed)],
    ["SubscriptionsPending", String(counts.pending)],
    ["SubscriptionsDeleted", String(counts.deleted)],
  ];
}

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
 * subscriptions, and those are held in their own store rather than here, since
 * an Unsubscribe reaches one by ARN without naming a topic at all.
 */
export class SimSnsTopic {
  public readonly name: SimSnsTopicName;
  public readonly arn: SimSnsTopicArn;

  /**
   * The Account that owns the topic, which a subscription created without a
   * caller of its own belongs to as well.
   */
  public readonly owner: string;

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
  reportedAttributes(counts: SimSnsSubscriptionCounts): Record<string, string> {
    const reported = new Map<string, string>([
      [topicArnAttributeName, this.arn.value],
      [ownerAttributeName, this.owner],
      ...subscriptionCountAttributes(counts),
    ]);

    this.held.reportInto(reported);

    return Object.fromEntries(reported);
  }
}

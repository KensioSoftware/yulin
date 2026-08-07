import type { SimSnsPublishedMessage } from "../message/sim-sns-published-message.js";
import { SimSnsSubscriptionArn } from "./sim-sns-subscription-arn.js";
import type {
  SimSnsSubscriptionAttributeInput,
  SimSnsSubscriptionAttributes,
} from "./sim-sns-subscription-attributes.js";
import {
  requireSimSnsSubscriptionEndpoint,
  type SimSnsSubscriptionEndpoint,
} from "./sim-sns-subscription-endpoint.js";
import type { SimSnsSubscriptionProtocol } from "./sim-sns-subscription-protocol.js";

const subscriptionArnAttributeName = "SubscriptionArn";

const topicArnAttributeName = "TopicArn";

const protocolAttributeName = "Protocol";

const endpointAttributeName = "Endpoint";

const ownerAttributeName = "Owner";

/**
 * The two attributes describing a confirmation that never had to happen.
 *
 * Real SNS confirms an `sqs` or a `lambda` subscription itself, so one created
 * through the API is confirmed as soon as it exists and the confirmation counts
 * as authenticated. Both are reported as constants because there is no protocol
 * here that leaves a subscription pending.
 */
const confirmationAttributes: readonly (readonly [string, string])[] = [
  ["ConfirmationWasAuthenticated", "true"],
  ["PendingConfirmation", "false"],
];

interface SimSnsSubscriptionProperties {
  readonly arn: SimSnsSubscriptionArn;
  readonly topicArn: string;
  readonly topicName: string;
  readonly protocol: SimSnsSubscriptionProtocol;
  readonly endpoint: SimSnsSubscriptionEndpoint;
  readonly owner: string;
  readonly attributes: SimSnsSubscriptionAttributes;
}

interface SimSnsSubscriptionInput {
  readonly topicArn: string;
  readonly topicName: string;
  readonly protocol: SimSnsSubscriptionProtocol;
  readonly endpoint: string | undefined;
  readonly owner: string;
  readonly attributes: SimSnsSubscriptionAttributes;
}

/**
 * One simulated subscription to a topic.
 *
 * The endpoint is held as the ARN its protocol implies rather than as a string,
 * because a delivery has to reach the Account and Region that ARN names rather
 * than the topic's, and because what the ARN has to name is a question the
 * protocol answers: a queue for `sqs`, a function for `lambda`.
 */
export class SimSnsSubscription {
  public readonly arn: SimSnsSubscriptionArn;
  public readonly topicArn: string;
  public readonly topicName: string;
  public readonly protocol: SimSnsSubscriptionProtocol;
  public readonly endpoint: SimSnsSubscriptionEndpoint;
  public readonly owner: string;

  private held: SimSnsSubscriptionAttributes;

  private constructor(properties: SimSnsSubscriptionProperties) {
    this.arn = properties.arn;
    this.topicArn = properties.topicArn;
    this.topicName = properties.topicName;
    this.protocol = properties.protocol;
    this.endpoint = properties.endpoint;
    this.owner = properties.owner;
    this.held = properties.attributes;
  }

  /**
   * Create a subscription, refusing an endpoint the protocol cannot reach.
   *
   * Nothing checks that the endpoint exists, because real SNS does not either:
   * a subscription to a queue or a function that is not there is created, and
   * fails when something is delivered to it. That is the moment the endpoint's
   * own policy is consulted too, so both failures surface in the same place,
   * and a permission taken away after subscribing stops delivery.
   */
  static of(input: SimSnsSubscriptionInput): SimSnsSubscription {
    const arn = SimSnsSubscriptionArn.forTopic(input.topicArn);

    return new this({
      arn,
      topicArn: input.topicArn,
      topicName: input.topicName,
      protocol: input.protocol,
      endpoint: requireSimSnsSubscriptionEndpoint(
        input.protocol,
        input.endpoint,
      ),
      owner: input.owner,
      attributes: input.attributes,
    });
  }

  /**
   * Whether another subscription would be a repeat of this one.
   *
   * Real SNS matches a repeated Subscribe on the topic, the protocol and the
   * endpoint. Both subscriptions belong to a topic already by the time this is
   * asked, so it is the other two that are compared here.
   */
  repeats(other: SimSnsSubscription): boolean {
    return (
      this.protocol === other.protocol &&
      this.endpoint.value === other.endpoint.value
    );
  }

  /**
   * The attributes this subscription currently holds.
   */
  get attributes(): SimSnsSubscriptionAttributes {
    return this.held;
  }

  /**
   * Apply the attributes a request names, refusing any this simulation will not
   * take.
   */
  applyAttributes(requested: SimSnsSubscriptionAttributeInput): void {
    this.held = this.held.with(requested);
  }

  /**
   * Whether this subscription wants a published message.
   *
   * The subscription's filter policy is what decides, so this is asked once per
   * subscription rather than once per publish: one subscriber filtering a
   * message out has nothing to do with what another receives.
   */
  accepts(message: SimSnsPublishedMessage): boolean {
    return this.held.accepts(message);
  }

  /**
   * This subscription as GetSubscriptionAttributes reports it.
   */
  reportedAttributes(): Record<string, string> {
    const reported = new Map<string, string>([
      [subscriptionArnAttributeName, this.arn.value],
      [topicArnAttributeName, this.topicArn],
      [protocolAttributeName, this.protocol],
      [endpointAttributeName, this.endpoint.value],
      [ownerAttributeName, this.owner],
      ...confirmationAttributes,
    ]);

    this.held.reportInto(reported);

    return Object.fromEntries(reported);
  }
}

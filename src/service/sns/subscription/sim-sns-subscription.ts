import { SimSnsQueueEndpointArn } from "./sim-sns-queue-endpoint-arn.js";
import { SimSnsSubscriptionArn } from "./sim-sns-subscription-arn.js";
import type {
  SimSnsSubscriptionAttributeInput,
  SimSnsSubscriptionAttributes,
} from "./sim-sns-subscription-attributes.js";
import type { SimSnsSubscriptionProtocol } from "./sim-sns-subscription-protocol.js";

const subscriptionArnAttributeName = "SubscriptionArn";

const topicArnAttributeName = "TopicArn";

const protocolAttributeName = "Protocol";

const endpointAttributeName = "Endpoint";

const ownerAttributeName = "Owner";

/**
 * The two attributes describing a confirmation that never had to happen.
 *
 * Real SNS confirms an `sqs` subscription itself, so one created through the
 * API is confirmed as soon as it exists and the confirmation counts as
 * authenticated. Both are reported as constants because there is no protocol
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
  readonly endpoint: SimSnsQueueEndpointArn;
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
 * The endpoint is held as a queue ARN rather than as a string because `sqs` is
 * the only protocol simulated, and a delivery has to reach the Account and
 * Region that ARN names rather than the topic's. When another protocol arrives
 * this becomes the endpoint of whichever kind the protocol implies.
 */
export class SimSnsSubscription {
  public readonly arn: SimSnsSubscriptionArn;
  public readonly topicArn: string;
  public readonly topicName: string;
  public readonly protocol: SimSnsSubscriptionProtocol;
  public readonly endpoint: SimSnsQueueEndpointArn;
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
   * Nothing checks that the queue exists, because real SNS does not either: a
   * subscription to a queue that is not there is created, and fails when
   * something is delivered to it. The queue's own policy is not consulted here
   * either, since delivery is not simulated yet, and both checks belong with it
   * when it arrives.
   */
  static of(input: SimSnsSubscriptionInput): SimSnsSubscription {
    const arn = SimSnsSubscriptionArn.forTopic(input.topicArn);

    return new this({
      arn,
      topicArn: input.topicArn,
      topicName: input.topicName,
      protocol: input.protocol,
      endpoint: SimSnsQueueEndpointArn.parse(input.endpoint ?? ""),
      owner: input.owner,
      attributes: input.attributes,
    });
  }

  /**
   * Apply the attributes a request names, refusing any this simulation will not
   * take.
   */
  applyAttributes(requested: SimSnsSubscriptionAttributeInput): void {
    this.held = this.held.with(requested);
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

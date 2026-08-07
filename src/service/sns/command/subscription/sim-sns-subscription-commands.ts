import { SimSnsSubscription } from "../../subscription/sim-sns-subscription.js";
import { SimSnsSubscriptionAttributes } from "../../subscription/sim-sns-subscription-attributes.js";
import { requireSimSnsProtocol } from "../../subscription/sim-sns-subscription-protocol.js";
import type { SimSnsSubscriptionStore } from "../../subscription/sim-sns-subscription-store.js";
import type { SimSnsTopic } from "../../topic/sim-sns-topic.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "../topic/sim-sns-topic-access.js";
import type { SimSnsSubscriptionAccess } from "./sim-sns-subscription-access.js";
import type {
  SimSubscribeCommand,
  SimSubscribeCommandOutput,
  SimUnsubscribeCommand,
  SimUnsubscribeCommandOutput,
} from "./subscription.command.js";

interface SimSnsSubscriptionCommandsProperties {
  readonly subscriptions: SimSnsSubscriptionStore;
  readonly topicAccess: SimSnsTopicAccess;
  readonly subscriptionAccess: SimSnsSubscriptionAccess;
}

/**
 * The commands that create and remove subscriptions.
 */
export class SimSnsSubscriptionCommands {
  private readonly subscriptions: SimSnsSubscriptionStore;
  private readonly topicAccess: SimSnsTopicAccess;
  private readonly subscriptionAccess: SimSnsSubscriptionAccess;

  constructor(properties: SimSnsSubscriptionCommandsProperties) {
    this.subscriptions = properties.subscriptions;
    this.topicAccess = properties.topicAccess;
    this.subscriptionAccess = properties.subscriptionAccess;
  }

  /**
   * Subscribe an endpoint to a topic.
   *
   * The subscription comes back confirmed, with an ARN rather than the `pending
   * confirmation` a protocol needing a confirmation token answers with. Real
   * SNS confirms an `sqs` subscription itself, and that is the only protocol
   * simulated.
   */
  subscribe(
    command: SimSubscribeCommand,
    options?: SimSnsRequestOptions,
  ): SimSubscribeCommandOutput {
    const { topic, caller } = this.topicAccess.requireByArnForCaller(
      "sns:Subscribe",
      command.input.TopicArn,
      options,
    );

    // The attributes are read whether or not they end up applied, so a
    // repeated Subscribe carrying one this simulation will not take is still
    // refused for it.
    const attributes = SimSnsSubscriptionAttributes.defaults().with(
      command.input.Attributes ?? {},
    );
    const subscription = SimSnsSubscription.of({
      topicArn: topic.arn.value,
      topicName: topic.name.value,
      protocol: requireSimSnsProtocol(command.input.Protocol),
      endpoint: command.input.Endpoint,
      owner: caller.accountId ?? topic.owner,
      attributes,
    });
    const existing = this.existingLike(topic, subscription);

    if (existing !== undefined) {
      return { $metadata: {}, SubscriptionArn: existing.arn.value };
    }

    this.subscriptions.add(subscription);

    return { $metadata: {}, SubscriptionArn: subscription.arn.value };
  }

  /**
   * Remove a subscription, so nothing more is delivered to its endpoint.
   *
   * An ARN naming no subscription is refused rather than quietly succeeding.
   * Real SNS documents `NotFoundException` for this command, and a silent
   * success would let a test unsubscribe the wrong ARN and believe it had
   * stopped a delivery.
   */
  unsubscribe(
    command: SimUnsubscribeCommand,
    options?: SimSnsRequestOptions,
  ): SimUnsubscribeCommandOutput {
    this.subscriptions.remove(
      this.subscriptionAccess.requireByArn(
        "sns:Unsubscribe",
        command.input.SubscriptionArn,
        options,
      ),
    );

    return { $metadata: {} };
  }

  /**
   * The subscription this request would duplicate, if there is one.
   *
   * Real SNS answers a repeated Subscribe for the same topic, protocol and
   * endpoint with the subscription that is already there rather than making a
   * second one, so the same endpoint receives one copy of a published message
   * however many times it subscribed. The attributes the repeated request
   * carries are not applied, which is how a repeated `CreateTopic` treats its
   * attributes too.
   *
   * Only the endpoint is compared. Real SNS matches on the protocol as well,
   * and there is one protocol here, so two subscriptions of the same endpoint
   * are necessarily of the same protocol. That comparison goes back in when a
   * second protocol arrives.
   */
  private existingLike(
    topic: SimSnsTopic,
    subscription: SimSnsSubscription,
  ): SimSnsSubscription | undefined {
    return this.subscriptions
      .forTopic(topic.name.value)
      .find((held) => held.endpoint.value === subscription.endpoint.value);
  }
}

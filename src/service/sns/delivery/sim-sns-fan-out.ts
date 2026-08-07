import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimSnsPublishedMessage } from "../message/sim-sns-published-message.js";
import type { SimSnsSubscription } from "../subscription/sim-sns-subscription.js";
import type { SimSnsSubscriptionStore } from "../subscription/sim-sns-subscription-store.js";
import type { SimSnsTopic } from "../topic/sim-sns-topic.js";
import type { SimSnsDeliveryEndpoints } from "./sim-sns-delivery.js";
import type { SimSnsDeliveryRequests } from "./sim-sns-delivery-request.js";
import type { SimSnsDeliveryFailure } from "./sim-sns-delivery-failures.js";
import { SimSnsDeliveryFailures } from "./sim-sns-delivery-failures.js";

interface SimSnsFanOutProperties {
  readonly subscriptions: SimSnsSubscriptionStore;
  readonly endpoints: SimSnsDeliveryEndpoints;
  readonly requests: SimSnsDeliveryRequests;
  readonly background: BackgroundScheduler;
}

/**
 * Hands a published message to every subscription of its topic.
 *
 * Delivery happens on the background scheduler, as real SNS delivers after the
 * publish has been answered: a publish gets a message id whether or not
 * anything downstream takes the message.
 * `simAws.backgroundTasksComplete()` is what waits for it.
 */
export class SimSnsFanOut {
  private readonly subscriptions: SimSnsSubscriptionStore;
  private readonly endpoints: SimSnsDeliveryEndpoints;
  private readonly requests: SimSnsDeliveryRequests;
  private readonly background: BackgroundScheduler;
  private readonly failures = new SimSnsDeliveryFailures();

  constructor(properties: SimSnsFanOutProperties) {
    this.subscriptions = properties.subscriptions;
    this.endpoints = properties.endpoints;
    this.requests = properties.requests;
    this.background = properties.background;
  }

  /**
   * Every message this scope could not deliver.
   */
  get deliveryFailures(): readonly SimSnsDeliveryFailure[] {
    return this.failures.all;
  }

  /**
   * Schedule one message for every subscription of a topic.
   *
   * Each subscription gets its own copy, which is the whole point of a topic:
   * two queues subscribed to one topic both receive what was published once.
   */
  publish(topic: SimSnsTopic, message: SimSnsPublishedMessage): void {
    const subscribed = this.subscriptions.forTopic(topic.name.value);

    for (const subscription of subscribed) {
      this.background.schedule(async () => {
        await this.deliver(topic, subscription, message);
      });
    }
  }

  /**
   * Deliver one message to one subscription, keeping whatever went wrong.
   *
   * A failure is recorded rather than thrown, because a background task left
   * rejected would fail an unrelated `backgroundTasksComplete()`, and real SNS
   * never reports a delivery failure to the caller who published.
   */
  private async deliver(
    topic: SimSnsTopic,
    subscription: SimSnsSubscription,
    message: SimSnsPublishedMessage,
  ): Promise<void> {
    try {
      await this.endpoints.deliver(this.requests.for(subscription, message));
    } catch (error) {
      this.failures.record({
        topicArn: topic.arn.value,
        subscriptionArn: subscription.arn.value,
        endpointArn: subscription.endpoint.value,
        messageId: message.messageId,
        error,
      });
    }
  }
}

import { SimSnsNotFoundException } from "../error/sim-sns.error.js";
import type { SimSnsSubscription } from "./sim-sns-subscription.js";

/**
 * The subscription counts one topic reports.
 *
 * Real SNS reports all three on every topic, so they are answered together
 * rather than one call at a time.
 */
export interface SimSnsSubscriptionCounts {
  readonly confirmed: number;
  readonly pending: number;
  readonly deleted: number;
}

/**
 * The subscriptions of one simulated SNS scope.
 *
 * They are held here rather than on the topic because a subscription outlives
 * the lookup that finds it by ARN: `Unsubscribe` carries a subscription ARN and
 * nothing else, so the subscription has to be reachable without knowing which
 * topic it belongs to first.
 */
export class SimSnsSubscriptionStore {
  private readonly subscriptions = new Map<string, SimSnsSubscription>();

  /**
   * How many subscriptions each topic has had deleted, by topic name.
   *
   * Real SNS reports a running count as `SubscriptionsDeleted` rather than
   * forgetting a subscription entirely, so the count is kept after the
   * subscription itself is gone.
   */
  private readonly deletedCounts = new Map<string, number>();

  /**
   * Every subscription in this scope, in creation order.
   */
  get all(): readonly SimSnsSubscription[] {
    return this.subscriptions.values().toArray();
  }

  /**
   * Store a newly created subscription.
   */
  add(subscription: SimSnsSubscription): void {
    this.subscriptions.set(subscription.arn.value, subscription);
  }

  /**
   * Find a subscription by ARN.
   */
  find(arn: string): SimSnsSubscription | undefined {
    return this.subscriptions.get(arn);
  }

  /**
   * Resolve a subscription by ARN, or refuse.
   */
  require(arn: string): SimSnsSubscription {
    const found = this.find(arn);

    if (found === undefined) {
      throw new SimSnsNotFoundException(
        `Subscription does not exist: no subscription with the ARN ${arn}`,
      );
    }

    return found;
  }

  /**
   * The subscriptions of one topic, in creation order.
   */
  forTopic(topicName: string): readonly SimSnsSubscription[] {
    return this.all.filter(
      (subscription) => subscription.topicName === topicName,
    );
  }

  /**
   * The counts a topic reports about its subscriptions.
   *
   * Nothing is ever pending, because the only protocol simulated is the one
   * real SNS confirms itself.
   */
  countsForTopic(topicName: string): SimSnsSubscriptionCounts {
    return {
      confirmed: this.forTopic(topicName).length,
      pending: 0,
      deleted: this.deletedCounts.get(topicName) ?? 0,
    };
  }

  /**
   * Forget one unsubscribed subscription.
   */
  remove(subscription: SimSnsSubscription): void {
    this.subscriptions.delete(subscription.arn.value);
    this.deletedCounts.set(
      subscription.topicName,
      (this.deletedCounts.get(subscription.topicName) ?? 0) + 1,
    );
  }

  /**
   * Forget every subscription of a deleted topic.
   *
   * Real SNS deletes a topic's subscriptions along with it, so a topic
   * recreated under the same name starts with none. The deleted count goes with
   * them for the same reason: it belonged to the topic that is gone.
   */
  removeForTopic(topicName: string): void {
    for (const subscription of this.forTopic(topicName)) {
      this.subscriptions.delete(subscription.arn.value);
    }

    this.deletedCounts.delete(topicName);
  }
}

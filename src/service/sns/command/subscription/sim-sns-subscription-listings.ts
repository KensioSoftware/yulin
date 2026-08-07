import type { SimSnsSubscription } from "../../subscription/sim-sns-subscription.js";
import type { SimSnsSubscriptionStore } from "../../subscription/sim-sns-subscription-store.js";
import { SimSnsPage } from "../sim-sns-page.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "../topic/sim-sns-topic-access.js";
import type {
  SimListSubscriptionsByTopicCommand,
  SimListSubscriptionsByTopicCommandOutput,
  SimListSubscriptionsCommand,
  SimListSubscriptionsCommandOutput,
  SimSnsListedSubscription,
} from "./subscription.command.js";

/**
 * One subscription as a listing reports it.
 *
 * A listing carries everything about a subscription but its attributes, which
 * is why `GetSubscriptionAttributes` exists at all.
 */
function listed(subscription: SimSnsSubscription): SimSnsListedSubscription {
  return {
    SubscriptionArn: subscription.arn.value,
    Owner: subscription.owner,
    Protocol: subscription.protocol,
    Endpoint: subscription.endpoint.value,
    TopicArn: subscription.topicArn,
  };
}

interface SimSnsSubscriptionListingsProperties {
  readonly subscriptions: SimSnsSubscriptionStore;
  readonly topicAccess: SimSnsTopicAccess;
}

/**
 * The commands that list subscriptions.
 */
export class SimSnsSubscriptionListings {
  private readonly subscriptions: SimSnsSubscriptionStore;
  private readonly topicAccess: SimSnsTopicAccess;

  constructor(properties: SimSnsSubscriptionListingsProperties) {
    this.subscriptions = properties.subscriptions;
    this.topicAccess = properties.topicAccess;
  }

  /**
   * List every subscription in this scope, oldest first.
   *
   * Real SNS gives this action no resource type, so it authorizes against `*`
   * the way `ListTopics` does: a policy naming a topic ARN allows no listing,
   * and the list is not filtered by what the caller can reach.
   */
  listSubscriptions(
    command: SimListSubscriptionsCommand,
    options?: SimSnsRequestOptions,
  ): SimListSubscriptionsCommandOutput {
    this.topicAccess.authorizeAnyTopic("sns:ListSubscriptions", options);

    return this.page(this.subscriptions.all, command.input.NextToken);
  }

  /**
   * List the subscriptions of one topic, oldest first.
   *
   * This one does name a topic, so it authorizes against the topic's ARN and
   * the topic's own policy takes part in the decision.
   */
  listSubscriptionsByTopic(
    command: SimListSubscriptionsByTopicCommand,
    options?: SimSnsRequestOptions,
  ): SimListSubscriptionsByTopicCommandOutput {
    const topic = this.topicAccess.requireByArn(
      "sns:ListSubscriptionsByTopic",
      command.input.TopicArn,
      options,
    );

    return this.page(
      this.subscriptions.forTopic(topic.name.value),
      command.input.NextToken,
    );
  }

  private page(
    listing: readonly SimSnsSubscription[],
    nextToken: string | undefined,
  ): SimListSubscriptionsCommandOutput {
    const page = new SimSnsPage<SimSnsSubscription>(listing, nextToken);

    return {
      $metadata: {},
      Subscriptions: page.items.map((subscription) => listed(subscription)),
      NextToken: page.nextToken,
    };
  }
}

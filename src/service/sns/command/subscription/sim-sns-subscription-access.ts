import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimSnsInvalidParameterException,
  SimSnsNotFoundException,
} from "../../error/sim-sns.error.js";
import type { SimSnsSubscription } from "../../subscription/sim-sns-subscription.js";
import { parseSnsSubscriptionArn } from "../../subscription/sim-sns-subscription-arn.js";
import type { SimSnsSubscriptionStore } from "../../subscription/sim-sns-subscription-store.js";
import type { SimSnsTopicAccess } from "../topic/sim-sns-topic-access.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";

interface SimSnsSubscriptionAccessProperties {
  readonly subscriptions: SimSnsSubscriptionStore;
  readonly topicAccess: SimSnsTopicAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * How a request reaches the subscription it names by ARN.
 *
 * The action is authorized before the subscription is looked for, which is the
 * other way round from a topic. Real SNS gives `Unsubscribe`,
 * `GetSubscriptionAttributes` and `SetSubscriptionAttributes` no resource type
 * at all, so IAM evaluates them against `*` and no topic policy takes part in
 * the decision. Nothing about the subscription can change the answer, so
 * nothing has to be found first.
 */
export class SimSnsSubscriptionAccess {
  private readonly subscriptions: SimSnsSubscriptionStore;
  private readonly topicAccess: SimSnsTopicAccess;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimSnsSubscriptionAccessProperties) {
    this.subscriptions = properties.subscriptions;
    this.topicAccess = properties.topicAccess;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Resolve the subscription a request names by ARN, authorizing the action
   * first.
   */
  requireByArn(
    action: string,
    subscriptionArn: string | undefined,
    options?: SimSnsRequestOptions,
  ): SimSnsSubscription {
    this.topicAccess.authorizeAnyTopic(action, options);

    return this.subscriptions.require(this.scopedArn(subscriptionArn));
  }

  /**
   * Read the subscription ARN a request carries, refusing one this scope could
   * not own.
   *
   * A subscription ARN is the topic's with an id on the end, so it names an
   * Account and a Region the same way a topic ARN does, and one naming another
   * scope reaches nothing here rather than being looked up locally by its id.
   */
  private scopedArn(subscriptionArn: string | undefined): string {
    if (subscriptionArn === undefined || subscriptionArn === "") {
      throw new SimSnsInvalidParameterException(
        "Invalid parameter: SubscriptionArn is required",
      );
    }

    const parts = parseSnsSubscriptionArn(subscriptionArn);

    if (parts === undefined) {
      throw new SimSnsInvalidParameterException(
        `Invalid parameter: SubscriptionArn Reason: ${subscriptionArn} is ` +
          `not a subscription ARN, which is ` +
          `arn:aws:sns:<region>:<account-id>:<topic-name>:<subscription-id>`,
      );
    }

    const { accountId, regionName } = this.accountRegionScope;

    if (parts.accountId !== accountId || parts.regionName !== regionName) {
      throw new SimSnsNotFoundException(
        `Subscription does not exist: ${subscriptionArn} names Account ` +
          `${parts.accountId} in ${parts.regionName}, and this simulated SNS ` +
          `is Account ${accountId} in ${regionName}`,
      );
    }

    return subscriptionArn;
  }
}

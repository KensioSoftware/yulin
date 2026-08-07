import { randomUUID } from "node:crypto";

/**
 * The number of colon separated parts in a subscription ARN.
 *
 * A subscription ARN is the topic's with the subscription id added on the end,
 * so it has one more part than a topic ARN. Counting the parts is what tells
 * the two apart, since neither has a resource type separator.
 */
const subscriptionArnParts = 7;

/**
 * Where one subscription is, in the facts its ARN carries.
 *
 * The topic ARN is rebuilt from the first six parts rather than held
 * separately, because a subscription ARN is the only thing an Unsubscribe
 * request carries and the topic it belongs to has to be found from it.
 */
export interface SimSnsSubscriptionLocation {
  readonly regionName: string;
  readonly accountId: string;
  readonly topicName: string;
  readonly topicArn: string;
  readonly subscriptionId: string;
}

/**
 * Read a subscription ARN into the topic and subscription id it carries.
 *
 * Nothing is returned for a string that is not a subscription ARN, including a
 * topic ARN, which is the same ARN without the subscription id on the end.
 */
export function parseSnsSubscriptionArn(
  value: string,
): SimSnsSubscriptionLocation | undefined {
  const parts = value.split(":");

  if (parts.length !== subscriptionArnParts) {
    return undefined;
  }

  const [prefix, partition, service, regionName, accountId, topicName, id] =
    parts;

  if (prefix !== "arn" || partition !== "aws" || service !== "sns") {
    return undefined;
  }

  if (
    regionName === undefined ||
    regionName === "" ||
    accountId === undefined ||
    accountId === "" ||
    topicName === undefined ||
    topicName === "" ||
    id === undefined ||
    id === ""
  ) {
    return undefined;
  }

  return {
    regionName,
    accountId,
    topicName,
    topicArn: `arn:aws:sns:${regionName}:${accountId}:${topicName}`,
    subscriptionId: id,
  };
}

/**
 * The ARN of one simulated subscription.
 *
 * Real SNS gives a subscription an ARN of the topic's with an opaque id on the
 * end, and that ARN is the only handle a caller has on the subscription:
 * `Unsubscribe`, `GetSubscriptionAttributes` and `SetSubscriptionAttributes`
 * all name one by it.
 */
export class SimSnsSubscriptionArn {
  public readonly value: string;
  public readonly topicArn: string;
  public readonly subscriptionId: string;

  private constructor(topicArn: string, subscriptionId: string) {
    this.topicArn = topicArn;
    this.subscriptionId = subscriptionId;
    this.value = `${topicArn}:${subscriptionId}`;
  }

  /**
   * Mint an ARN for a new subscription to a topic.
   *
   * Real SNS's subscription ids are opaque, and a UUID is opaque in the same
   * way while being unique without anything having to keep count.
   */
  static forTopic(topicArn: string): SimSnsSubscriptionArn {
    return new this(topicArn, randomUUID());
  }
}

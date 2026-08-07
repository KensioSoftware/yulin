import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  parseSnsSubscriptionArn,
  SimSnsSubscriptionArn,
} from "./sim-sns-subscription-arn.js";

const topicArn = "arn:aws:sns:us-east-1:888888888888:orders";

describe("SNS subscription ARN", () => {
  it("mints an ARN of the topic's with an id on the end", () => {
    // Given a topic ARN.
    // When a subscription ARN is minted for it.
    const arn = SimSnsSubscriptionArn.forTopic(topicArn);

    // Then it is the topic's ARN with the subscription id added.
    assertIdentical(arn.topicArn, topicArn);
    assertIdentical(arn.value, `${topicArn}:${arn.subscriptionId}`);
  });

  it("reads back the topic a subscription ARN belongs to", () => {
    // Given a minted subscription ARN.
    const arn = SimSnsSubscriptionArn.forTopic(topicArn);

    // When it is read.
    const parts = parseSnsSubscriptionArn(arn.value);

    // Then the topic it belongs to comes back out of it, which is all an
    // Unsubscribe request carries.
    assertNonNullable(parts);
    assertIdentical(parts.topicArn, topicArn);
    assertIdentical(parts.topicName, "orders");
    assertIdentical(parts.accountId, "888888888888");
    assertIdentical(parts.regionName, "us-east-1");
    assertIdentical(parts.subscriptionId, arn.subscriptionId);
  });

  it("reads nothing from a string that is not a subscription ARN", () => {
    // Given strings that are not subscription ARNs.
    const values = [
      topicArn,
      `${topicArn}:1:2`,
      "arn:aws:sqs:us-east-1:888888888888:orders:1",
      "arn:aws-cn:sns:us-east-1:888888888888:orders:1",
      "urn:aws:sns:us-east-1:888888888888:orders:1",
      "arn:aws:sns::888888888888:orders:1",
      "arn:aws:sns:us-east-1::orders:1",
      "arn:aws:sns:us-east-1:888888888888::1",
      "arn:aws:sns:us-east-1:888888888888:orders:",
    ];

    // When each is read.
    // Then nothing comes back, so none of them reaches a subscription.
    for (const value of values) {
      assertUndefined(parseSnsSubscriptionArn(value));
    }
  });
});

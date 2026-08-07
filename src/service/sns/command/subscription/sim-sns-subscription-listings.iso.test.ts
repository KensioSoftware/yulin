import {
  CreateTopicCommand,
  ListSubscriptionsByTopicCommand,
  ListSubscriptionsCommand,
} from "@aws-sdk/client-sns";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { subscribeQueue } from "../../../../../test/sns/subscription-fixture.js";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import { SimSnsInvalidParameterException } from "../../error/sim-sns.error.js";

describe("SNS subscription listings", () => {
  it("lists a topic's subscriptions with everything but their attributes", async () => {
    // Given a topic with a subscribed queue.
    const { simAws, topicArn } = await simAwsWithTopic();

    await subscribeQueue(simAws, topicArn, "orders-queue");

    // When the topic's subscriptions are listed.
    const listed = await simAws
      .sns()
      .listSubscriptionsByTopic(
        new ListSubscriptionsByTopicCommand({ TopicArn: topicArn }),
      );

    // Then the listing names the endpoint, its protocol and its owner.
    const subscription = listed.Subscriptions?.[0];

    assertNonNullable(subscription);
    assertIdentical(subscription.TopicArn, topicArn);
    assertIdentical(subscription.Protocol, "sqs");
    assertIdentical(
      subscription.Endpoint,
      "arn:aws:sqs:us-east-1:888888888888:orders-queue",
    );
    assertIdentical(subscription.Owner, "888888888888");
    assertUndefined(listed.NextToken);
  });

  it("lists only the subscriptions of the topic it names", async () => {
    // Given two topics, each with a queue subscribed.
    const { simAws, topicArn } = await simAwsWithTopic();
    const other = await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "audit" }));

    await subscribeQueue(simAws, topicArn, "orders-queue");
    await subscribeQueue(simAws, other.TopicArn, "audit-queue");

    // When one topic's subscriptions are listed, and then every subscription.
    const byTopic = await simAws
      .sns()
      .listSubscriptionsByTopic(
        new ListSubscriptionsByTopicCommand({ TopicArn: topicArn }),
      );
    const all = await simAws
      .sns()
      .listSubscriptions(new ListSubscriptionsCommand({}));

    // Then the topic's listing carries its own, and the whole listing carries
    // both.
    assertArrayEquals(
      byTopic.Subscriptions?.map((subscription) => subscription.Endpoint),
      ["arn:aws:sqs:us-east-1:888888888888:orders-queue"],
    );
    assertArrayLength(all.Subscriptions ?? [], 2);
  });

  it("pages a listing at a hundred subscriptions", async () => {
    // Given a topic with more subscriptions than one page holds.
    const { simAws, topicArn } = await simAwsWithTopic();

    await Promise.all(
      Array.from({ length: 101 }, async (_unused, index) =>
        subscribeQueue(simAws, topicArn, `orders-${String(index)}`),
      ),
    );

    // When the subscriptions are listed and the next page is asked for.
    const first = await simAws
      .sns()
      .listSubscriptions(new ListSubscriptionsCommand({}));
    const second = await simAws
      .sns()
      .listSubscriptions(
        new ListSubscriptionsCommand({ NextToken: first.NextToken }),
      );

    // Then the first page holds a hundred and the second holds the rest.
    assertArrayLength(first.Subscriptions ?? [], 100);
    assertIdentical(first.NextToken, "100");
    assertArrayLength(second.Subscriptions ?? [], 1);
    assertUndefined(second.NextToken);
  });

  it("refuses a continuation token it did not issue", async () => {
    // Given a topic with a subscribed queue.
    const { simAws, topicArn } = await simAwsWithTopic();

    await subscribeQueue(simAws, topicArn, "orders-queue");

    // When a listing is asked to continue from something else.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .listSubscriptions(new ListSubscriptionsCommand({ NextToken: "next" }));
    });

    // Then it is refused rather than quietly starting again from the top.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });
});

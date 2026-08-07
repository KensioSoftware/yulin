import {
  DeleteTopicCommand,
  GetSubscriptionAttributesCommand,
  GetTopicAttributesCommand,
  UnsubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simAwsWithSubscription } from "../../../../../test/sns/subscription-fixture.js";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import {
  SimSnsInvalidParameterException,
  SimSnsNotFoundException,
} from "../../error/sim-sns.error.js";

describe("SNS Unsubscribe", () => {
  it("removes the subscription and counts it as deleted", async () => {
    // Given a topic with a subscribed queue.
    const { simAws, topicArn, subscriptionArn } =
      await simAwsWithSubscription();

    // When the subscription is removed.
    await simAws
      .sns()
      .unsubscribe(
        new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }),
      );

    // Then the topic has none left, so nothing more is delivered to the queue.
    assertArrayLength(simAws.sns().topicSubscriptions("orders"), 0);

    // And the topic counts it among the ones it has had deleted, as real SNS
    // does rather than forgetting it entirely.
    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: topicArn }),
      );

    assertNonNullable(read.Attributes);
    assertObjectMatches(read.Attributes, {
      SubscriptionsConfirmed: "0",
      SubscriptionsDeleted: "1",
    });
  });

  it("refuses an ARN naming no subscription", async () => {
    // Given a topic with a subscribed queue.
    const { simAws, subscriptionArn } = await simAwsWithSubscription();

    // When the same subscription is removed twice.
    await simAws
      .sns()
      .unsubscribe(
        new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }),
      );

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .unsubscribe(
          new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }),
        );
    });

    // Then the second is refused, rather than succeeding and letting a test
    // believe it had stopped a delivery it never reached.
    assertInstanceOf(error, SimSnsNotFoundException);
  });

  it("refuses a subscription ARN that is not one", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a topic ARN is unsubscribed, which is a subscription ARN without
    // the subscription id on the end.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .unsubscribe(new UnsubscribeCommand({ SubscriptionArn: topicArn }));
    });

    // Then it is refused for what it is.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(error.message, "is not a subscription ARN");
  });

  it("refuses a subscription ARN naming another Account or Region", async () => {
    // Given a topic with a subscribed queue.
    const { simAws, subscriptionArn } = await simAwsWithSubscription();
    const id = subscriptionArn.split(":").at(-1) ?? "";

    // When a subscription ARN in another scope is unsubscribed.
    const refusals = await Promise.all(
      [
        `arn:aws:sns:eu-west-2:888888888888:orders:${id}`,
        `arn:aws:sns:us-east-1:222222222222:orders:${id}`,
      ].map(async (arn) =>
        assertThrowsErrorAsync(async () => {
          await simAws
            .sns()
            .unsubscribe(new UnsubscribeCommand({ SubscriptionArn: arn }));
        }),
      ),
    );

    // Then neither reaches this scope's subscription of the same id.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsNotFoundException);
    }

    assertArrayLength(simAws.sns().topicSubscriptions("orders"), 1);
  });

  it("removes the subscriptions of a deleted topic", async () => {
    // Given a topic with a subscribed queue.
    const { simAws, topicArn, subscriptionArn } =
      await simAwsWithSubscription();

    // When the topic is deleted.
    await simAws
      .sns()
      .deleteTopic(new DeleteTopicCommand({ TopicArn: topicArn }));

    // Then its subscriptions go with it.
    assertArrayLength(simAws.sns().topicSubscriptions("orders"), 0);

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().getSubscriptionAttributes(
        new GetSubscriptionAttributesCommand({
          SubscriptionArn: subscriptionArn,
        }),
      );
    });

    assertInstanceOf(error, SimSnsNotFoundException);
  });
});

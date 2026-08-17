import {
  GetSubscriptionAttributesCommand,
  GetTopicAttributesCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simAwsWithPublishingRole,
  simAwsWithTopic,
  simSnsOrdersTopicArn,
} from "../../../../../test/sns/topic-fixture.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account-id.js";
import { SimSns } from "../../sim-sns.js";

const queueArn = "arn:aws:sqs:us-east-1:888888888888:orders-queue";

describe("SNS Subscribe", () => {
  it("confirms an sqs subscription at once and answers with its ARN", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a queue is subscribed to it.
    const subscribed = await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArn,
      }),
    );

    // Then the answer is a subscription ARN rather than "pending
    // confirmation", because real SNS confirms an sqs subscription itself.
    assertNonNullable(subscribed.SubscriptionArn);
    assertStringIncludes(
      subscribed.SubscriptionArn,
      `${simSnsOrdersTopicArn}:`,
    );

    // And the topic holds it.
    assertArrayLength(simAws.sns().topicSubscriptions("orders"), 1);
  });

  it("reports the subscription's attributes as a confirmed one", async () => {
    // Given a topic with a subscribed queue.
    const { simAws, topicArn } = await simAwsWithTopic();
    const subscribed = await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArn,
      }),
    );

    // When the subscription's attributes are read.
    const read = await simAws.sns().getSubscriptionAttributes(
      new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscribed.SubscriptionArn,
      }),
    );

    // Then they name the subscription, its topic and where it delivers.
    // Nothing is pending, since this protocol needed no confirmation, and the
    // envelope is the default rather than raw delivery.
    assertNonNullable(read.Attributes);
    assertObjectMatches(read.Attributes, {
      SubscriptionArn: subscribed.SubscriptionArn,
      TopicArn: topicArn,
      Protocol: "sqs",
      Endpoint: queueArn,
      Owner: "888888888888",
      PendingConfirmation: "false",
      ConfirmationWasAuthenticated: "true",
      RawMessageDelivery: "false",
    });
  });

  it("confirms an sms subscription at once and reports the number", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a phone number is subscribed to it.
    const subscribed = await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sms",
        Endpoint: "+15550100",
      }),
    );

    // Then the answer is a subscription ARN, as it is for a queue: the number
    // is the endpoint, so real SNS has nothing to confirm either.
    assertNonNullable(subscribed.SubscriptionArn);
    assertStringIncludes(
      subscribed.SubscriptionArn,
      `${simSnsOrdersTopicArn}:`,
    );

    // And the subscription reports where it texts.
    const read = await simAws.sns().getSubscriptionAttributes(
      new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscribed.SubscriptionArn,
      }),
    );

    assertNonNullable(read.Attributes);
    assertObjectMatches(read.Attributes, {
      Protocol: "sms",
      Endpoint: "+15550100",
      PendingConfirmation: "false",
    });
  });

  it("takes RawMessageDelivery on the Subscribe request", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a queue is subscribed asking for the raw message.
    const subscribed = await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArn,
        Attributes: { RawMessageDelivery: "true" },
      }),
    );

    // Then the subscription holds it from the moment it exists.
    const read = await simAws.sns().getSubscriptionAttributes(
      new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscribed.SubscriptionArn,
      }),
    );

    assertNonNullable(read.Attributes);
    assertObjectMatches(read.Attributes, { RawMessageDelivery: "true" });
  });

  it("answers a repeated Subscribe with the subscription already there", async () => {
    // Given a topic with a subscribed queue.
    const { simAws, topicArn } = await simAwsWithTopic();
    const first = await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArn,
      }),
    );

    // When the same queue is subscribed again.
    const second = await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArn,
      }),
    );

    // Then it is the same subscription, so the queue receives one copy of a
    // published message rather than one per Subscribe.
    assertIdentical(second.SubscriptionArn, first.SubscriptionArn);
    assertArrayLength(simAws.sns().topicSubscriptions("orders"), 1);
  });

  it("counts the topic's subscriptions in its attributes", async () => {
    // Given a topic with two queues subscribed.
    const { simAws, topicArn } = await simAwsWithTopic();

    await Promise.all(
      ["orders-queue", "audit-queue"].map(async (name) =>
        simAws.sns().subscribe(
          new SubscribeCommand({
            TopicArn: topicArn,
            Protocol: "sqs",
            Endpoint: `arn:aws:sqs:us-east-1:888888888888:${name}`,
          }),
        ),
      ),
    );

    // When the topic's attributes are read.
    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: topicArn }),
      );

    // Then both are confirmed, and nothing is pending or deleted.
    assertNonNullable(read.Attributes);
    assertObjectMatches(read.Attributes, {
      SubscriptionsConfirmed: "2",
      SubscriptionsPending: "0",
      SubscriptionsDeleted: "0",
    });
  });

  it("falls back to the topic's Account when the caller has none", async () => {
    // Given a simulated SNS built on its own, whose caller resolves to nobody
    // in particular.
    const simSns = new SimSns({
      accountRegionScope: {
        accountId: "333333333333" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
    });

    await simSns.createTopic({ input: { Name: "orders" } });

    // When a queue is subscribed to its topic.
    const subscribed = await simSns.subscribe({
      input: {
        TopicArn: "arn:aws:sns:eu-west-2:333333333333:orders",
        Protocol: "sqs",
        Endpoint: "arn:aws:sqs:eu-west-2:333333333333:orders-queue",
      },
    });

    // Then the subscription belongs to the Account owning the topic, rather
    // than to no Account at all.
    const read = await simSns.getSubscriptionAttributes({
      input: { SubscriptionArn: subscribed.SubscriptionArn },
    });

    assertNonNullable(read.Attributes);
    assertIdentical(read.Attributes["Owner"], "333333333333");
  });

  it("records the subscribing Account as the subscription's owner", async () => {
    // Given a topic whose policy admits another Account's Role to subscribe to
    // it, and that Role's own Account allowing it too.
    const { simAws, topicArn } = await simAwsWithTopic({
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: {
            AWS: "arn:aws:iam::222222222222:role/OrderPublisher",
          },
          Action: "sns:Subscribe",
          Resource: simSnsOrdersTopicArn,
        },
      }),
    });
    const arn = await simAwsWithPublishingRole(
      simAws,
      "222222222222",
      true,
      "sns:Subscribe",
    );

    // When that Role subscribes one of its Account's own queues.
    const subscribed = await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: "arn:aws:sqs:us-east-1:222222222222:orders-queue",
      }),
      { caller: { kind: "arn", arn } },
    );

    // Then the subscription belongs to the Account that made it rather than to
    // the Account owning the topic.
    const read = await simAws.sns().getSubscriptionAttributes(
      new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscribed.SubscriptionArn,
      }),
    );

    assertNonNullable(read.Attributes);
    assertIdentical(read.Attributes["Owner"], "222222222222");
  });
});

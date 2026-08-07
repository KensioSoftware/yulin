import {
  PublishBatchCommand,
  PublishCommand,
  SetSubscriptionAttributesCommand,
  UnsubscribeCommand,
} from "@aws-sdk/client-sns";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertBufferEqual,
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSnsDeliveredMessage,
  simSnsSubscribedQueue,
} from "../../../../test/sns/subscription-fixture.js";
import { simAwsWithTopic } from "../../../../test/sns/topic-fixture.js";

/**
 * The `Message` a delivered envelope carries.
 */
function envelopeMessage(body: string | undefined): unknown {
  assertNonNullable(body);

  return (JSON.parse(body) as Record<string, unknown>)["Message"];
}

describe("SNS fan-out to a queue", () => {
  it("delivers one published message to every subscribed queue", async () => {
    // Given a topic with two queues subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const orders = await simSnsSubscribedQueue(simAws, "orders", topicArn);
    const audit = await simSnsSubscribedQueue(simAws, "audit", topicArn);

    // When one message is published.
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    // Then both queues receive a copy of it, which is what a topic is for.
    assertIdentical(
      envelopeMessage(await simSnsDeliveredMessage(simAws, orders.queueUrl)),
      "order-1",
    );
    assertIdentical(
      envelopeMessage(await simSnsDeliveredMessage(simAws, audit.queueUrl)),
      "order-1",
    );
  });

  it("delivers the SNS envelope by default", async () => {
    // Given a topic with a subscribed queue.
    const { simAws, topicArn } = await simAwsWithTopic();
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "orders",
      topicArn,
    );

    // When a message with a subject and an attribute is published.
    const published = await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: "New order",
        Message: "order-1",
        MessageAttributes: {
          tenant: { DataType: "String", StringValue: "acme" },
        },
      }),
    );

    // Then the body is the envelope real SNS wraps a message in, so a consumer
    // reads the message out of it rather than off the body.
    const body = await simSnsDeliveredMessage(simAws, queueUrl);

    assertNonNullable(body);
    assertObjectMatches(JSON.parse(body), {
      Type: "Notification",
      MessageId: published.MessageId,
      TopicArn: topicArn,
      Subject: "New order",
      Message: "order-1",
      SignatureVersion: "1",
      MessageAttributes: { tenant: { Type: "String", Value: "acme" } },
    });
  });

  it("delivers the raw message with its attributes when asked to", async () => {
    // Given a topic with a queue subscribed for raw delivery.
    const { simAws, topicArn } = await simAwsWithTopic();
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "orders",
      topicArn,
    );
    const [subscription] = simAws.sns().topicSubscriptions("orders");

    assertNonNullable(subscription);

    await simAws.sns().setSubscriptionAttributes(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscription.arn.value,
        AttributeName: "RawMessageDelivery",
        AttributeValue: "true",
      }),
    );

    // When a message with an attribute is published.
    await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: "order-1",
        MessageAttributes: {
          tenant: { DataType: "String", StringValue: "acme" },
        },
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then the body is the message on its own, and the publish's attributes
    // arrive as SQS message attributes instead of inside an envelope.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MessageAttributeNames: ["All"],
      }),
    );
    const message = received.Messages?.[0];

    assertNonNullable(message);
    assertIdentical(message.Body, "order-1");
    assertIdentical(message.MessageAttributes?.["tenant"]?.StringValue, "acme");
  });

  it("carries a binary attribute base64 in the envelope and as bytes raw", async () => {
    // Given a topic with a queue subscribed for the envelope, and one for the
    // raw message.
    const { simAws, topicArn } = await simAwsWithTopic();
    const wrapped = await simSnsSubscribedQueue(simAws, "wrapped", topicArn);
    const raw = await simSnsSubscribedQueue(simAws, "raw", topicArn);
    const rawSubscription = simAws
      .sns()
      .topicSubscriptions("orders")
      .find((held) => held.endpoint.value === raw.queueArn);

    assertNonNullable(rawSubscription);

    await simAws.sns().setSubscriptionAttributes(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: rawSubscription.arn.value,
        AttributeName: "RawMessageDelivery",
        AttributeValue: "true",
      }),
    );

    // When a message with a binary attribute is published.
    await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: "order-1",
        MessageAttributes: {
          receipt: {
            DataType: "Binary",
            BinaryValue: Uint8Array.from([1, 2, 3]),
          },
        },
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then the envelope carries it base64 encoded, since an envelope is JSON.
    const body = await simSnsDeliveredMessage(simAws, wrapped.queueUrl);

    assertNonNullable(body);
    assertObjectMatches(JSON.parse(body), {
      MessageAttributes: {
        receipt: {
          Type: "Binary",
          Value: Buffer.from([1, 2, 3]).toString("base64"),
        },
      },
    });

    // And raw delivery carries it as the bytes it was published as.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: raw.queueUrl,
        MessageAttributeNames: ["All"],
      }),
    );

    assertBufferEqual(
      Buffer.from(
        received.Messages?.[0]?.MessageAttributes?.["receipt"]?.BinaryValue ??
          [],
      ),
      Buffer.from([1, 2, 3]),
    );
  });

  it("delivers every message of a batch", async () => {
    // Given a topic with a subscribed queue.
    const { simAws, topicArn } = await simAwsWithTopic();
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "orders",
      topicArn,
    );

    // When two messages are published as one batch.
    await simAws.sns().publishBatch(
      new PublishBatchCommand({
        TopicArn: topicArn,
        PublishBatchRequestEntries: [
          { Id: "one", Message: "order-1" },
          { Id: "two", Message: "order-2" },
        ],
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then both reach the queue.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
      }),
    );

    assertArrayLength(received.Messages, 2);
  });

  it("stops delivering once the subscription is gone", async () => {
    // Given a topic with a subscribed queue that is then unsubscribed.
    const { simAws, topicArn } = await simAwsWithTopic();
    const { queueUrl, queueArn } = await simSnsSubscribedQueue(
      simAws,
      "orders",
      topicArn,
    );
    const [subscription] = simAws.sns().topicSubscriptions("orders");

    assertNonNullable(subscription);
    assertIdentical(subscription.endpoint.value, queueArn);

    await simAws
      .sns()
      .unsubscribe(
        new UnsubscribeCommand({ SubscriptionArn: subscription.arn.value }),
      );

    // When a message is published.
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    // Then nothing reaches the queue.
    assertUndefined(await simSnsDeliveredMessage(simAws, queueUrl));
  });
});

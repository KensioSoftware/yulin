import { PublishBatchCommand, PublishCommand } from "@aws-sdk/client-sns";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertObjectMatches,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type {
  SimSnsLambdaEvent,
  SimSnsLambdaRecord,
} from "../../../../../test/sns/function-fixture.js";
import { simSnsSubscribedFunction } from "../../../../../test/sns/function-fixture.js";
import { simSnsSubscribedQueue } from "../../../../../test/sns/subscription-fixture.js";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";

/**
 * The one record of the one event a function was invoked with.
 */
function onlyRecord(events: readonly SimSnsLambdaEvent[]): SimSnsLambdaRecord {
  assertArrayLength(events, 1);

  const [event] = events;

  assertNonNullable(event);
  assertArrayLength(event.Records, 1);

  const [record] = event.Records;

  assertNonNullable(record);

  return record;
}

describe("SNS fan-out to a Lambda function", () => {
  it("invokes a subscribed function with one record", async () => {
    // Given a topic with a function subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
    );

    // When one message is published.
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

    await simAws.backgroundTasksComplete();

    // Then the function was invoked with the SNS event shape, carrying the
    // published message, its subject and its attributes.
    const record = onlyRecord(consumer.events);

    assertIdentical(record.EventSource, "aws:sns");
    assertIdentical(record.EventVersion, "1.0");
    assertObjectMatches(record.Sns, {
      Type: "Notification",
      MessageId: published.MessageId,
      TopicArn: topicArn,
      Subject: "New order",
      Message: "order-1",
      SignatureVersion: "1",
      MessageAttributes: { tenant: { Type: "String", Value: "acme" } },
    });
  });

  it("names the subscription the invocation came from", async () => {
    // Given a topic with a function subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
    );
    const [subscription] = simAws.sns().topicSubscriptions("orders");

    assertNonNullable(subscription);

    // When a message is published.
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    await simAws.backgroundTasksComplete();

    // Then the record names the subscription rather than the topic, which is
    // how a handler tells two subscriptions of one topic apart.
    assertIdentical(
      onlyRecord(consumer.events).EventSubscriptionArn,
      subscription.arn.value,
    );
  });

  it("spells the two URLs the way a Lambda event spells them", async () => {
    // Given a topic with a function subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
    );

    // When a message is published.
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    await simAws.backgroundTasksComplete();

    // Then the event has `SigningCertUrl` and `UnsubscribeUrl`, where the
    // envelope a queue receives has `SigningCertURL` and `UnsubscribeURL`.
    const notification = onlyRecord(consumer.events).Sns;

    assertTypeString(notification["SigningCertUrl"]);
    assertTypeString(notification["UnsubscribeUrl"]);
    assertUndefined(notification["SigningCertURL"]);
    assertUndefined(notification["UnsubscribeURL"]);
  });

  it("carries a null subject and empty attributes when there are none", async () => {
    // Given a topic with a function subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
    );

    // When a message with neither a subject nor attributes is published.
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    await simAws.backgroundTasksComplete();

    // Then both fields are still there, as they are in a real SNS event. The
    // envelope a queue receives leaves each out instead.
    const notification = onlyRecord(consumer.events).Sns;

    assertIdentical(notification["Subject"], null);
    assertObjectEquals(notification["MessageAttributes"], {});
  });

  it("invokes once per message of a batch rather than once per batch", async () => {
    // Given a topic with a function subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
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

    // Then there are two invocations of one record each. Real SNS does not
    // batch to Lambda, so `Records` never holds more than one entry.
    assertArrayLength(consumer.events, 2);

    for (const event of consumer.events) {
      assertArrayLength(event.Records, 1);
    }
  });

  it("delivers to a queue and a function subscribed to one topic", async () => {
    // Given a topic with one of each subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
    );
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "orders-queue",
      topicArn,
    );

    // When one message is published.
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    await simAws.backgroundTasksComplete();

    // Then both receive their own copy of it, over their own protocol.
    assertIdentical(onlyRecord(consumer.events).Sns["Message"], "order-1");

    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertArrayLength(received.Messages, 1);
  });
});

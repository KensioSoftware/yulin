import { ReceiveMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithSqsEventSource } from "../../../../test/lambda/event-source-fixture.js";

describe("sim Lambda SQS event source mappings", () => {
  it("delivers a sent message to the function as an SQS event", async () => {
    // Given a queue mapped to a function.
    const { simAws, queueUrl, queueArn, events } =
      await simAwsWithSqsEventSource();

    simAws.clock().freeze();

    // When a message is sent to the queue.
    const sent = await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    await simAws.backgroundTasksComplete();

    // Then the handler was given one real-shaped SQS record.
    assertArrayLength(events, 1);

    const record = events[0].Records[0];

    assertNonNullable(record);
    assertIdentical(record.messageId, sent.MessageId);
    assertIdentical(record.body, "order-1");
    assertIdentical(record.eventSource, "aws:sqs");
    assertIdentical(record.eventSourceARN, queueArn);
    assertIdentical(record.awsRegion, simAws.defaultRegionName);
    assertIdentical(record.md5OfBody, sent.MD5OfMessageBody);
    assertIdentical(record.attributes["ApproximateReceiveCount"], "1");
    assertIdentical(
      record.attributes["SentTimestamp"],
      String(simAws.now().getTime()),
    );
    assertNonNullable(record.receiptHandle);
  });

  it("deletes the batch a handler returns from", async () => {
    // Given a queue mapped to a function that handles what it is given.
    const { simAws, queueUrl } = await simAwsWithSqsEventSource();

    // When a message is sent and delivered.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // Then the message is gone from the queue.
    const remaining = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertUndefined(remaining.Messages);
  });
});

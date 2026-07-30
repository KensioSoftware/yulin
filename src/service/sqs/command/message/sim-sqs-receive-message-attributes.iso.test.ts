import { ReceiveMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  SimSqsInvalidAttributeName,
  SimSqsInvalidParameterValue,
  SimSqsUnsupportedOperation,
} from "../../error/sim-sqs.error.js";
import { simAwsWithQueue } from "../../../../../test/sqs/queue-fixture.js";

describe("SQS ReceiveMessage attributes and validation", () => {
  it("reports the system attributes a request asks for", async () => {
    // Given a queue holding a message, sent at a known instant.
    const { simAws, queueUrl } = await simAwsWithQueue();
    simAws.clock().freeze();

    const sentAt = simAws.now();
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When every system attribute is asked for.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MessageSystemAttributeNames: ["All"],
      }),
    );

    // Then the ones this simulation knows are reported, in milliseconds.
    const attributes = received.Messages?.[0]?.Attributes;

    assertNonNullable(attributes);
    assertIdentical(attributes["ApproximateReceiveCount"], "1");
    assertIdentical(attributes["SentTimestamp"], String(sentAt.getTime()));
    assertIdentical(
      attributes["ApproximateFirstReceiveTimestamp"],
      String(sentAt.getTime()),
    );
  });

  it("reports system attributes named the discontinued way too", async () => {
    // Given a queue holding a message.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When they are asked for as AttributeNames, as older code does.
    const received = await simAws.sqs().receiveMessage({
      input: {
        QueueUrl: queueUrl,
        AttributeNames: ["ApproximateReceiveCount"],
      },
    });

    // Then they come back the same way.
    assertIdentical(
      received.Messages?.[0]?.Attributes?.["ApproximateReceiveCount"],
      "1",
    );
  });

  it("reports no system attributes when a request asks for none", async () => {
    // Given a queue holding a message.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When it is received without naming any attribute.
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // Then none come back, as real SQS returns none.
    assertUndefined(received.Messages?.[0]?.Attributes);
  });

  it("leaves out a system attribute a standard queue has no value for", async () => {
    // Given a queue holding a message.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When a FIFO-only attribute is asked for.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MessageSystemAttributeNames: ["MessageGroupId"],
      }),
    );

    // Then it is left out rather than refused, as real SQS leaves it out.
    assertUndefined(received.Messages?.[0]?.Attributes);
  });

  it("refuses a system attribute name that is not an SQS attribute", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an invented attribute is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().receiveMessage({
        input: {
          QueueUrl: queueUrl,
          MessageSystemAttributeNames: ["ReceiveCount"],
        },
      });
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidAttributeName);
  });

  it("returns at once when long polling has nothing to wait for", async () => {
    // Given an empty queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a receive asks to wait for a message.
    const received = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 20 }),
      );

    // Then it comes back empty rather than waiting: nothing else is running that
    // could send a message while it waited.
    assertUndefined(received.Messages);
  });

  it("refuses a wait time beyond twenty seconds", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a longer wait is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().receiveMessage(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          WaitTimeSeconds: 21,
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a request for more than ten messages", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When eleven messages are asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().receiveMessage(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 11,
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a visibility timeout beyond twelve hours", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a longer timeout is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().receiveMessage(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          VisibilityTimeout: 43_201,
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a FIFO receive attempt id", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a receive request carries one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().receiveMessage(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          ReceiveRequestAttemptId: "attempt-1",
        }),
      );
    });

    // Then it is refused, since FIFO queues are not simulated.
    assertInstanceOf(error, SimSqsUnsupportedOperation);
  });
});

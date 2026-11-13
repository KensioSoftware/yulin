import { createHash } from "node:crypto";
import {
  ReceiveMessageCommand,
  SendMessageBatchCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { faker } from "@faker-js/faker";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertNotEqual,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  SimSqsInvalidParameterValue,
  SimSqsMissingParameter,
} from "../../error/sim-sqs.error.js";
import { simAwsWithFifoQueue } from "../../../../../test/sqs/queue-fixture.js";

describe("SQS SendMessage to a FIFO queue", () => {
  it("refuses a message with no message group", async () => {
    // Given a FIFO queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When a message is sent with no MessageGroupId.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageDeduplicationId: "order-1",
        }),
      );
    });

    // Then it is refused for the missing parameter.
    assertInstanceOf(error, SimSqsMissingParameter);
    assertStringIncludes(error.message, "MessageGroupId");
  });

  it("refuses a message with no way to deduplicate it", async () => {
    // Given a FIFO queue without content-based deduplication.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When a message is sent with no deduplication id.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageGroupId: "customer-1",
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
    assertStringIncludes(error.message, "ContentBasedDeduplication");
  });

  it("refuses a delay on one message", async () => {
    // Given a FIFO queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When a message is sent with its own delay.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageGroupId: "customer-1",
          MessageDeduplicationId: "order-1",
          DelaySeconds: 5,
        }),
      );
    });

    // Then it is refused, since a FIFO queue only delays at queue level.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
    assertStringIncludes(error.message, "DelaySeconds");
  });

  it("refuses a message group id with a space in it", async () => {
    // Given a FIFO queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When a message group id carries a character SQS does not allow.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageGroupId: "customer one",
          MessageDeduplicationId: "order-1",
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("answers a duplicate with the first send's message id", async () => {
    // Given a FIFO queue that has accepted a message.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();
    const deduplicationId = faker.string.uuid();
    const send = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: "order-1",
      MessageGroupId: "customer-1",
      MessageDeduplicationId: deduplicationId,
    });
    const first = await simAws.sqs().sendMessage(send);

    // When the same send is retried inside five minutes.
    await simAws.clock().advanceBy({ minutes: 4 });
    const retried = await simAws.sqs().sendMessage(send);

    // Then it is accepted as the same message, and only one is delivered.
    assertIdentical(retried.MessageId, first.MessageId);
    assertIdentical(retried.SequenceNumber, first.SequenceNumber);

    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
      }),
    );

    assertArrayLength(received.Messages, 1);
  });

  it("accepts the same deduplication id again after five minutes", async () => {
    // Given a FIFO queue that accepted a message five minutes ago.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();
    const send = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: "order-1",
      MessageGroupId: "customer-1",
      MessageDeduplicationId: "order-1",
    });
    const first = await simAws.sqs().sendMessage(send);

    await simAws.clock().advanceBy({ minutes: 5 });

    // When the same send is made again.
    const again = await simAws.sqs().sendMessage(send);

    // Then it is a new message.
    assertNotEqual(again.MessageId, first.MessageId);
  });

  it("still deduplicates a fresh id once older ones have expired", async () => {
    // Given a FIFO queue whose earlier deduplication id has expired.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();
    const sendWithId = async (id: string): Promise<string | undefined> => {
      const sent = await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: id,
          MessageGroupId: "customer-1",
          MessageDeduplicationId: id,
        }),
      );

      return sent.MessageId;
    };

    await sendWithId("order-1");
    await simAws.clock().advanceBy({ minutes: 6 });

    // When a new id is sent twice.
    const first = await sendWithId("order-2");
    const again = await sendWithId("order-2");

    // Then the second send is still a duplicate of the first.
    assertIdentical(again, first);
  });

  it("deduplicates by the SHA-256 of the body when asked to", async () => {
    // Given a FIFO queue with content-based deduplication.
    const { simAws, queueUrl } = await simAwsWithFifoQueue({
      ContentBasedDeduplication: "true",
    });
    const body = faker.lorem.sentence();

    // When the same body is sent twice, then once more with the body's
    // SHA-256 given as an explicit id.
    const first = await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: body,
        MessageGroupId: "customer-1",
      }),
    );
    const second = await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: body,
        MessageGroupId: "customer-2",
      }),
    );
    const explicit = await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "something else",
        MessageGroupId: "customer-3",
        MessageDeduplicationId: createHash("sha256").update(body).digest("hex"),
      }),
    );

    // Then all three are the one message.
    assertIdentical(second.MessageId, first.MessageId);
    assertIdentical(explicit.MessageId, first.MessageId);
  });

  it("deduplicates within each message group when scoped to them", async () => {
    // Given a FIFO queue deduplicating per message group.
    const { simAws, queueUrl } = await simAwsWithFifoQueue({
      DeduplicationScope: "messageGroup",
    });

    // When two groups send under the same deduplication id.
    const sent = await Promise.all(
      ["customer-1", "customer-2"].map(
        async (group) =>
          await simAws.sqs().sendMessage(
            new SendMessageCommand({
              QueueUrl: queueUrl,
              MessageBody: "order-1",
              MessageGroupId: group,
              MessageDeduplicationId: "order-1",
            }),
          ),
      ),
    );

    // Then both are delivered.
    assertNotEqual(sent[0]?.MessageId, sent[1]?.MessageId);
  });

  it("reports a larger sequence number for each message", async () => {
    // Given a FIFO queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When two messages are sent.
    const sendOrder = async (id: string): Promise<bigint> => {
      const sent = await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: id,
          MessageGroupId: "customer-1",
          MessageDeduplicationId: id,
        }),
      );

      assertNonNullable(sent.SequenceNumber);

      return BigInt(sent.SequenceNumber);
    };
    const first = await sendOrder("order-1");
    const second = await sendOrder("order-2");

    // Then the second is numbered after the first.
    assertTrue(second > first);
  });

  it("deduplicates between the entries of one batch", async () => {
    // Given a FIFO queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When a batch carries the same deduplication id twice.
    const sent = await simAws.sqs().sendMessageBatch(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: ["a", "b"].map((id) => ({
          Id: id,
          MessageBody: `order-${id}`,
          MessageGroupId: "customer-1",
          MessageDeduplicationId: "order-1",
        })),
      }),
    );

    // Then both entries succeed as the one message, with a sequence number.
    const [first, second] = sent.Successful ?? [];

    assertNonNullable(first?.SequenceNumber);
    assertIdentical(second?.MessageId, first.MessageId);
  });

  it("fails only the batch entry missing a message group", async () => {
    // Given a FIFO queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When one entry of a batch names no message group.
    const sent = await simAws.sqs().sendMessageBatch(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: [
          {
            Id: "grouped",
            MessageBody: "order-1",
            MessageGroupId: "customer-1",
            MessageDeduplicationId: "order-1",
          },
          {
            Id: "ungrouped",
            MessageBody: "order-2",
            MessageDeduplicationId: "order-2",
          },
        ],
      }),
    );

    // Then that entry fails on its own.
    assertArrayLength(sent.Successful, 1);
    assertIdentical(sent.Failed?.[0]?.Code, "MissingParameter");
  });
});

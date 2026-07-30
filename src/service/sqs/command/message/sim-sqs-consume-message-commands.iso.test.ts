import {
  DeleteMessageBatchCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  SimSqsReceiptHandleIsInvalid,
  SimSqsValidationException,
} from "../../error/sim-sqs.error.js";
import {
  simAwsWithQueue,
  simAwsWithReceivedMessage,
} from "../../../../../test/sqs/queue-fixture.js";

describe("SQS DeleteMessage", () => {
  it("deletes the message a receipt handle names", async () => {
    // Given a received message that was immediately visible again.
    const { simAws, queueUrl, receiptHandle } = await simAwsWithReceivedMessage(
      {
        VisibilityTimeout: "0",
      },
    );

    // When it is deleted.
    await simAws.sqs().deleteMessage(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );

    // Then it is gone.
    const empty = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertUndefined(empty.Messages);
  });

  it("deletes a message whose visibility timeout has already lapsed", async () => {
    // Given a received message whose timeout has run out, with nobody else
    // having received it since.
    const { simAws, queueUrl, receiptHandle } = await simAwsWithReceivedMessage(
      {
        VisibilityTimeout: "30",
      },
    );
    await simAws.clock().advanceBy({ seconds: 31 });

    // When the slow consumer finally deletes it.
    await simAws.sqs().deleteMessage(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );

    // Then the delete works, as it does on real AWS: the handle is still the one
    // from the most recent receive.
    const empty = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertUndefined(empty.Messages);
  });

  it("deletes nothing when the handle is from an earlier receive", async () => {
    // Given a message received twice, because the first consumer was slower than
    // the visibility timeout.
    const { simAws, queueUrl, receiptHandle } = await simAwsWithReceivedMessage(
      {
        VisibilityTimeout: "30",
      },
    );
    await simAws.clock().advanceBy({ seconds: 31 });
    await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // When the first consumer deletes with the handle it was given.
    await simAws.sqs().deleteMessage(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );

    // Then the request succeeds and the message stays where it is, as real SQS
    // leaves it: the receive that handle belongs to has been superseded.
    await simAws.clock().advanceBy({ seconds: 31 });

    const again = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertIdentical(again.Messages?.[0]?.Body, "order-1");
  });

  it("accepts a second delete of the same message", async () => {
    // Given a message that has been deleted.
    const { simAws, queueUrl, receiptHandle } =
      await simAwsWithReceivedMessage();
    await simAws.sqs().deleteMessage(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );

    // When the same handle is used again, as a retry would.
    await simAws.sqs().deleteMessage(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );

    // Then nothing is left on the queue and nothing failed.
    const empty = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertUndefined(empty.Messages);
  });

  it("refuses a receipt handle the queue never issued", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a made-up handle is used.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().deleteMessage(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: "not-a-handle",
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsReceiptHandleIsInvalid);
  });

  it("refuses a delete with no receipt handle", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a delete carries no handle.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().deleteMessage({ input: { QueueUrl: queueUrl } });
    });

    // Then the missing input is reported.
    assertInstanceOf(error, SimSqsValidationException);
  });
});

describe("SQS DeleteMessageBatch", () => {
  it("deletes every entry and reports each under its own id", async () => {
    // Given a queue holding two received messages.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-2" }),
      );

    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 2,
      }),
    );

    // When both are deleted at once.
    const deleted = await simAws.sqs().deleteMessageBatch(
      new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: (received.Messages ?? []).map((message, index) => ({
          Id: `entry-${String(index)}`,
          ReceiptHandle: message.ReceiptHandle,
        })),
      }),
    );

    // Then both went through.
    assertArrayEquals(
      deleted.Successful?.map((entry) => entry.Id),
      ["entry-0", "entry-1"],
    );
    assertArrayEquals(deleted.Failed ?? [], []);
  });

  it("reports one failed entry while the rest of the batch goes through", async () => {
    // Given a received message, and a made-up handle beside it.
    const { simAws, queueUrl, receiptHandle } =
      await simAwsWithReceivedMessage();

    // When both are deleted at once.
    const deleted = await simAws.sqs().deleteMessageBatch(
      new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: [
          { Id: "good", ReceiptHandle: receiptHandle },
          { Id: "bad", ReceiptHandle: "not-a-handle" },
        ],
      }),
    );

    // Then the good one is deleted and the bad one is reported on its own.
    assertArrayEquals(
      deleted.Successful?.map((entry) => entry.Id),
      ["good"],
    );
    assertIdentical(deleted.Failed?.[0]?.Code, "ReceiptHandleIsInvalid");
  });
});

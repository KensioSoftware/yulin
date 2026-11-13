import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSqsInvalidParameterValue,
  SimSqsUnsupportedOperation,
} from "../../error/sim-sqs.error.js";
import {
  simAwsWithFifoQueue,
  simAwsWithQueue,
} from "../../../../../test/sqs/queue-fixture.js";

describe("SQS ReceiveMessage from a FIFO queue", () => {
  const send = async (
    simAws: SimAws,
    queueUrl: string,
    group: string,
    body: string,
  ): Promise<void> => {
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: body,
        MessageGroupId: group,
        MessageDeduplicationId: body,
      }),
    );
  };

  const receiveBodies = async (
    simAws: SimAws,
    queueUrl: string,
    maxNumberOfMessages = 10,
  ): Promise<readonly string[]> => {
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxNumberOfMessages,
      }),
    );

    return (received.Messages ?? []).map((message) => message.Body);
  };

  it("hands out each group in order, one group before the next", async () => {
    // Given messages from two groups sent interleaved.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    for (const [group, body] of [
      ["a", "a-1"],
      ["b", "b-1"],
      ["a", "a-2"],
      ["b", "b-2"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- sends are ordered
      await send(simAws, queueUrl, group, body);
    }

    // When they are received together.
    const bodies = await receiveBodies(simAws, queueUrl);

    // Then each group comes in order, as many of one as there are first.
    assertArrayEquals(bodies, ["a-1", "a-2", "b-1", "b-2"]);
  });

  it("holds back a group while one of its messages is in flight", async () => {
    // Given a group whose first message has been received and not deleted,
    // and another group with a message waiting.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    await send(simAws, queueUrl, "a", "a-1");
    await receiveBodies(simAws, queueUrl, 1);
    await send(simAws, queueUrl, "a", "a-2");
    await send(simAws, queueUrl, "b", "b-1");

    // When the queue is received from again.
    const bodies = await receiveBodies(simAws, queueUrl);

    // Then only the other group's message comes back.
    assertArrayEquals(bodies, ["b-1"]);
  });

  it("releases a group once its in-flight message is deleted", async () => {
    // Given a group held back by an in-flight message.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    await send(simAws, queueUrl, "a", "a-1");
    await send(simAws, queueUrl, "a", "a-2");

    const first = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    const receiptHandle = first.Messages?.[0]?.ReceiptHandle;

    assertNonNullable(receiptHandle);

    // When that message is deleted.
    await simAws.sqs().deleteMessage(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );

    // Then the next one in the group can be received.
    assertArrayEquals(await receiveBodies(simAws, queueUrl), ["a-2"]);
  });

  it("hands a group out again in order once a visibility timeout lapses", async () => {
    // Given a group whose first message was received and never deleted.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    await send(simAws, queueUrl, "a", "a-1");
    await receiveBodies(simAws, queueUrl, 1);
    await send(simAws, queueUrl, "a", "a-2");

    // When its visibility timeout lapses.
    await simAws.clock().advanceBy({ seconds: 31 });

    // Then the group comes back from the start.
    assertArrayEquals(await receiveBodies(simAws, queueUrl), ["a-1", "a-2"]);
  });

  it("releases a group when its message is made visible again", async () => {
    // Given a group held back by an in-flight message.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    await send(simAws, queueUrl, "a", "a-1");

    const first = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    const receiptHandle = first.Messages?.[0]?.ReceiptHandle;

    assertNonNullable(receiptHandle);

    // When the consumer gives the message straight back.
    await simAws.sqs().changeMessageVisibility(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: 0,
      }),
    );

    // Then the group can be received again.
    assertArrayEquals(await receiveBodies(simAws, queueUrl), ["a-1"]);
  });

  it("reports the FIFO system attributes", async () => {
    // Given a message on a FIFO queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();
    const sent = await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        MessageGroupId: "customer-1",
        MessageDeduplicationId: "order-1-dedup",
      }),
    );

    // When it is received asking for every system attribute.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MessageSystemAttributeNames: ["All"],
      }),
    );

    // Then the group, the deduplication id and the sequence number come back.
    const attributes = received.Messages?.[0]?.Attributes;

    assertNonNullable(attributes);
    assertIdentical(attributes["MessageGroupId"], "customer-1");
    assertIdentical(attributes["MessageDeduplicationId"], "order-1-dedup");
    assertIdentical(attributes["SequenceNumber"], sent.SequenceNumber);
  });

  it("refuses to delete with a receipt handle whose timeout lapsed", async () => {
    // Given a FIFO message received and left past its visibility timeout.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    await send(simAws, queueUrl, "a", "a-1");

    const first = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    const receiptHandle = first.Messages?.[0]?.ReceiptHandle;

    assertNonNullable(receiptHandle);
    await simAws.clock().advanceBy({ seconds: 31 });

    // When the slow consumer deletes it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().deleteMessage(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
        }),
      );
    });

    // Then the handle is refused as expired, and the message is still there.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
    assertStringIncludes(error.message, "expired");
    assertArrayEquals(await receiveBodies(simAws, queueUrl), ["a-1"]);
  });

  it("repeats a receive retried with the same attempt id", async () => {
    // Given a receive made under an attempt id whose response was lost.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    await send(simAws, queueUrl, "a", "a-1");

    const receive = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      ReceiveRequestAttemptId: "attempt-1",
    });
    const first = await simAws.sqs().receiveMessage(receive);

    // When it is retried with the same attempt id.
    const retried = await simAws.sqs().receiveMessage(receive);

    // Then the same message comes back under the same receipt handle.
    assertIdentical(
      retried.Messages?.[0]?.ReceiptHandle,
      first.Messages?.[0]?.ReceiptHandle,
    );
  });

  it("receives afresh once the attempt's messages were deleted", async () => {
    // Given a receive under an attempt id whose message was then deleted.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    await send(simAws, queueUrl, "a", "a-1");

    const receive = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      ReceiveRequestAttemptId: "attempt-1",
    });
    const first = await simAws.sqs().receiveMessage(receive);

    await simAws.sqs().deleteMessage(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: first.Messages?.[0]?.ReceiptHandle,
      }),
    );

    // When the attempt id is used again.
    const again = await simAws.sqs().receiveMessage(receive);

    // Then it is an ordinary receive of an empty queue.
    assertUndefined(again.Messages);
  });

  it("refuses an attempt id on a standard queue", async () => {
    // Given a standard queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a receive carries an attempt id.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().receiveMessage(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          ReceiveRequestAttemptId: "attempt-1",
        }),
      );
    });

    // Then it is refused rather than given a meaning it has nowhere.
    assertInstanceOf(error, SimSqsUnsupportedOperation);
  });

  it("refuses a malformed attempt id", async () => {
    // Given a FIFO queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When a receive carries an attempt id with a space in it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().receiveMessage(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          ReceiveRequestAttemptId: "attempt one",
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });
});

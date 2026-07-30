import {
  ChangeMessageVisibilityCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  SimSqsInvalidParameterValue,
  SimSqsMessageNotInflight,
  SimSqsReceiptHandleIsInvalid,
} from "../../error/sim-sqs.error.js";
import {
  simAwsWithQueue,
  simAwsWithReceivedMessage,
} from "../../../../../test/sqs/queue-fixture.js";

describe("SQS ChangeMessageVisibility", () => {
  it("keeps a message hidden for longer", async () => {
    // Given a received message with a short visibility timeout.
    const { simAws, queueUrl, receiptHandle } = await simAwsWithReceivedMessage(
      {
        VisibilityTimeout: "30",
      },
    );

    // When the consumer asks for ten minutes more.
    await simAws.sqs().changeMessageVisibility(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: 600,
      }),
    );

    await simAws.clock().advanceBy({ seconds: 31 });

    const empty = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // Then the message is still hidden past the queue's own timeout.
    assertUndefined(empty.Messages);
  });

  it("releases a message back to the queue at once", async () => {
    // Given a received message hidden for five minutes.
    const { simAws, queueUrl, receiptHandle } = await simAwsWithReceivedMessage(
      {
        VisibilityTimeout: "300",
      },
    );

    // When the consumer gives it up rather than handling it.
    await simAws.sqs().changeMessageVisibility(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: 0,
      }),
    );

    // Then it is receivable again straight away.
    const again = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertIdentical(again.Messages?.[0]?.Body, "order-1");
  });

  it("refuses to change the visibility of a message that is not in flight", async () => {
    // Given a received message whose visibility timeout has lapsed.
    const { simAws, queueUrl, receiptHandle } = await simAwsWithReceivedMessage(
      {
        VisibilityTimeout: "30",
      },
    );
    await simAws.clock().advanceBy({ seconds: 31 });

    // When the consumer asks for longer.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().changeMessageVisibility(
        new ChangeMessageVisibilityCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: 600,
        }),
      );
    });

    // Then it is refused the way real SQS refuses it.
    assertInstanceOf(error, SimSqsMessageNotInflight);
  });

  it("refuses a visibility timeout beyond twelve hours", async () => {
    // Given a received message.
    const { simAws, queueUrl, receiptHandle } =
      await simAwsWithReceivedMessage();

    // When a longer timeout is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().changeMessageVisibility(
        new ChangeMessageVisibilityCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: 43_201,
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a change with no timeout", async () => {
    // Given a received message.
    const { simAws, queueUrl, receiptHandle } =
      await simAwsWithReceivedMessage();

    // When no timeout is given.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().changeMessageVisibility({
        input: { QueueUrl: queueUrl, ReceiptHandle: receiptHandle },
      });
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a handle the queue never issued", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a made-up handle is used.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().changeMessageVisibility(
        new ChangeMessageVisibilityCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: "not-a-handle",
          VisibilityTimeout: 60,
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsReceiptHandleIsInvalid);
  });
});

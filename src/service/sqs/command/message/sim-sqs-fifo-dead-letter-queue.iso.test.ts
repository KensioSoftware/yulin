import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simAwsWithFifoQueue } from "../../../../../test/sqs/queue-fixture.js";

describe("SQS FIFO dead-letter queues", () => {
  const fifoQueueWithDeadLetterQueue = async (): Promise<{
    simAws: SimAws;
    queueUrl: string;
    deadLetterQueueUrl: string;
  }> => {
    const simAws = new SimAws();
    const deadLetter = await simAws.sqs().createQueue(
      new CreateQueueCommand({
        QueueName: "orders-dlq.fifo",
        Attributes: { FifoQueue: "true", MessageRetentionPeriod: "120" },
      }),
    );
    const deadLetterArn = simAws.sqs().findQueue("orders-dlq.fifo")?.arn.value;

    assertNonNullable(deadLetter.QueueUrl);
    assertNonNullable(deadLetterArn);

    const { queueUrl } = await simAwsWithFifoQueue(
      {
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: deadLetterArn,
          maxReceiveCount: 1,
        }),
      },
      simAws,
    );

    return { simAws, queueUrl, deadLetterQueueUrl: deadLetter.QueueUrl };
  };

  it("moves a message that keeps failing, unblocking its group", async () => {
    // Given a FIFO queue giving up after one receive, holding two messages
    // of one group.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await fifoQueueWithDeadLetterQueue();

    for (const body of ["a-1", "a-2"]) {
      // oxlint-disable-next-line no-await-in-loop -- sends are ordered
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: body,
          MessageGroupId: "a",
          MessageDeduplicationId: body,
        }),
      );
    }

    // When the first is received and left to time out.
    await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    await simAws.clock().advanceBy({ seconds: 31 });

    // Then it is on the dead-letter queue with its group, and the next message
    // of the group is receivable.
    const moved = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: deadLetterQueueUrl,
        MessageSystemAttributeNames: ["MessageGroupId"],
      }),
    );

    const movedMessage = moved.Messages?.[0];

    assertNonNullable(movedMessage);
    assertIdentical(movedMessage.Body, "a-1");
    assertIdentical(movedMessage.Attributes?.["MessageGroupId"], "a");

    const next = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertArrayEquals(
      (next.Messages ?? []).map((message) => message.Body),
      ["a-2"],
    );
  });

  it("restarts retention for a message moved to a FIFO queue", async () => {
    // Given a message that waited on the source queue longer than the
    // dead-letter queue's two minute retention before failing.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await fifoQueueWithDeadLetterQueue();

    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "a-1",
        MessageGroupId: "a",
        MessageDeduplicationId: "a-1",
      }),
    );
    await simAws.clock().advanceBy({ minutes: 3 });
    await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    await simAws.clock().advanceBy({ seconds: 31 });

    // When the dead-letter queue is read just after the move, and again once
    // its retention has run from the move.
    const kept = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: deadLetterQueueUrl,
        VisibilityTimeout: 0,
      }),
    );

    await simAws.clock().advanceBy({ seconds: 121 });

    const dropped = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: deadLetterQueueUrl }),
      );

    // Then it was kept from the move, not from the send, and dropped after.
    assertIdentical(kept.Messages?.[0]?.Body, "a-1");
    assertUndefined(dropped.Messages);
  });
});

import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  failToHandleMessage,
  simAwsWithDeadLetterQueue,
} from "../../../../../test/sqs/queue-fixture.js";

describe("SQS dead-letter queues", () => {
  it("moves a message to the dead-letter queue once its receives run out", async () => {
    // Given a queue that gives up after three receives, holding a message.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await simAwsWithDeadLetterQueue(3);
    const sent = await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When a consumer receives it three times without ever deleting it.
    await failToHandleMessage(simAws, queueUrl);
    await failToHandleMessage(simAws, queueUrl);
    await failToHandleMessage(simAws, queueUrl);

    // Then it is on the dead-letter queue, with the same id and body.
    const dead = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: deadLetterQueueUrl }),
      );
    const message = dead.Messages?.[0];

    assertNonNullable(message);
    assertIdentical(message.MessageId, sent.MessageId);
    assertIdentical(message.Body, "order-1");
  });

  it("stops handing the message out on the queue it came from", async () => {
    // Given a queue that gives up after two receives, holding a message.
    const { simAws, queueUrl } = await simAwsWithDeadLetterQueue(2);
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When a consumer fails to handle it twice.
    await failToHandleMessage(simAws, queueUrl);
    await failToHandleMessage(simAws, queueUrl);

    // Then the source queue has nothing left to hand out.
    const empty = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertUndefined(empty.Messages);
  });

  it("keeps a message that is deleted before its receives run out", async () => {
    // Given a queue that gives up after two receives, holding a message.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await simAwsWithDeadLetterQueue(2);
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When a consumer fails once and then handles it on the second attempt.
    await failToHandleMessage(simAws, queueUrl);
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    await simAws.sqs().deleteMessage(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: received.Messages?.[0]?.ReceiptHandle,
      }),
    );
    await simAws.clock().advanceBy({ seconds: 31 });

    // Then nothing ever reaches the dead-letter queue.
    const dead = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: deadLetterQueueUrl }),
      );

    assertUndefined(dead.Messages);
  });

  it("leaves a message in flight until its visibility timeout lapses", async () => {
    // Given a queue that gives up after one receive, holding a message.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await simAwsWithDeadLetterQueue(1);
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When it has been received and the timeout is still running.
    await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // Then it has not moved yet, because the consumer may still delete it.
    const dead = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: deadLetterQueueUrl }),
      );

    assertUndefined(dead.Messages);
  });

  it("counts the moved message on the dead-letter queue and not the source", async () => {
    // Given a queue that gives up after one receive, holding a message.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await simAwsWithDeadLetterQueue(1);
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When the one receive it gets goes unhandled.
    await failToHandleMessage(simAws, queueUrl);

    // Then both queues report the move.
    const source = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["ApproximateNumberOfMessages"],
      }),
    );
    const dead = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: deadLetterQueueUrl,
        AttributeNames: ["ApproximateNumberOfMessages"],
      }),
    );

    assertIdentical(source.Attributes?.["ApproximateNumberOfMessages"], "0");
    assertIdentical(dead.Attributes?.["ApproximateNumberOfMessages"], "1");
  });

  it("gives the moved message a fresh receive count on the dead-letter queue", async () => {
    // Given a message that has been moved to the dead-letter queue.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await simAwsWithDeadLetterQueue(2);
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await failToHandleMessage(simAws, queueUrl);
    await failToHandleMessage(simAws, queueUrl);

    // When it is received from the dead-letter queue.
    const dead = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: deadLetterQueueUrl,
        MessageSystemAttributeNames: ["ApproximateReceiveCount"],
      }),
    );

    // Then this is its first receive from that queue, because a receive count
    // counts receives from one queue.
    assertIdentical(
      dead.Messages?.[0]?.Attributes?.["ApproximateReceiveCount"],
      "1",
    );
  });

  it("keeps the sent timestamp of the moved message", async () => {
    // Given a queue that gives up after one receive, holding a message sent at
    // an instant a test can name.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await simAwsWithDeadLetterQueue(1);
    simAws.clock().freeze();
    const sentAt = simAws.clock().now().getTime();
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When the message is moved half a minute later.
    await failToHandleMessage(simAws, queueUrl);

    const dead = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: deadLetterQueueUrl,
        MessageSystemAttributeNames: ["SentTimestamp"],
      }),
    );

    // Then it still reports when it was originally sent, as real SQS leaves the
    // enqueue timestamp of a standard queue's message alone.
    assertIdentical(
      dead.Messages?.[0]?.Attributes?.["SentTimestamp"],
      String(sentAt),
    );
  });

  it("reports the queue a dead-lettered message came from", async () => {
    // Given a message that has been moved to the dead-letter queue.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await simAwsWithDeadLetterQueue(1);
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await failToHandleMessage(simAws, queueUrl);

    // When it is received asking for every system attribute.
    const dead = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: deadLetterQueueUrl,
        MessageSystemAttributeNames: ["All"],
      }),
    );

    // Then it names its source queue, which only a moved message has.
    assertIdentical(
      dead.Messages?.[0]?.Attributes?.["DeadLetterQueueSourceArn"],
      simAws.sqs().findQueue("orders")?.arn.value,
    );
  });

  it("keeps the message attributes of the moved message", async () => {
    // Given a queue that gives up after one receive, holding a message with an
    // attribute on it.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await simAwsWithDeadLetterQueue(1);
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        MessageAttributes: {
          customer: { DataType: "String", StringValue: "acme" },
        },
      }),
    );

    // When the message is moved.
    await failToHandleMessage(simAws, queueUrl);

    const dead = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: deadLetterQueueUrl,
        MessageAttributeNames: ["All"],
      }),
    );

    // Then the attribute is still on it.
    assertIdentical(
      dead.Messages?.[0]?.MessageAttributes?.["customer"]?.StringValue,
      "acme",
    );
  });

  it("accepts a late delete from the consumer whose message was moved", async () => {
    // Given a consumer holding the handle from the receive that used up the
    // message's last attempt, which has since moved to the dead-letter queue.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await simAwsWithDeadLetterQueue(1);
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    await simAws.clock().advanceBy({ seconds: 31 });

    // When that consumer finally finishes and deletes.
    await simAws.sqs().deleteMessage(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: received.Messages?.[0]?.ReceiptHandle,
      }),
    );

    // Then the delete succeeds and deletes nothing, as a delete under a
    // superseded handle does, leaving the message on the dead-letter queue.
    const dead = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: deadLetterQueueUrl }),
      );

    assertIdentical(dead.Messages?.[0]?.Body, "order-1");
  });

  it("leaves messages where they are once the dead-letter queue is deleted", async () => {
    // Given a queue whose dead-letter queue has been deleted.
    const { simAws, queueUrl, deadLetterQueueUrl } =
      await simAwsWithDeadLetterQueue(1);
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.sqs().deleteQueue({ input: { QueueUrl: deadLetterQueueUrl } });

    // When the message runs out of receives.
    await failToHandleMessage(simAws, queueUrl);

    // Then it stays on its own queue rather than being lost.
    const again = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertIdentical(again.Messages?.[0]?.Body, "order-1");
  });
});

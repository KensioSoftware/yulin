import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simAwsWithQueue } from "../../../../../test/sqs/queue-fixture.js";

describe("SQS ReceiveMessage", () => {
  it("hands out a message with a receipt handle and the digest of its body", async () => {
    // Given a queue holding one message.
    const { simAws, queueUrl } = await simAwsWithQueue();
    const sent = await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When it is received.
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // Then the message is the one that was sent, under a fresh receipt handle.
    const message = received.Messages?.[0];

    assertNonNullable(message);
    assertIdentical(message.MessageId, sent.MessageId);
    assertIdentical(message.Body, "order-1");
    assertIdentical(message.MD5OfBody, sent.MD5OfMessageBody);
    assertNonNullable(message.ReceiptHandle);
  });

  it("hides a received message for the queue's visibility timeout", async () => {
    // Given a queue with a thirty second visibility timeout holding a message.
    const { simAws, queueUrl } = await simAwsWithQueue({
      VisibilityTimeout: "30",
    });
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When it is received, and another consumer tries to receive it.
    await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    const empty = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // Then there is nothing to receive while the timeout is running.
    assertUndefined(empty.Messages);
  });

  it("gives an undeleted message back once the visibility timeout lapses", async () => {
    // Given a received message that was never deleted.
    const { simAws, queueUrl } = await simAwsWithQueue({
      VisibilityTimeout: "30",
    });
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // When simulated time moves past the timeout.
    await simAws.clock().advanceBy({ seconds: 31 });

    const again = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MessageSystemAttributeNames: ["ApproximateReceiveCount"],
      }),
    );

    // Then the message is receivable again, and says it has been received twice.
    const message = again.Messages?.[0];

    assertNonNullable(message);
    assertIdentical(message.Body, "order-1");
    assertIdentical(message.Attributes?.["ApproximateReceiveCount"], "2");
  });

  it("keeps a deleted message from coming back when the timeout lapses", async () => {
    // Given a message that was received and deleted.
    const { simAws, queueUrl } = await simAwsWithQueue({
      VisibilityTimeout: "30",
    });
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    await simAws.sqs().deleteMessage(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: received.Messages?.[0]?.ReceiptHandle,
      }),
    );

    // When simulated time moves past the timeout.
    await simAws.clock().advanceBy({ seconds: 31 });

    const empty = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // Then there is nothing left on the queue.
    assertUndefined(empty.Messages);
  });

  it("hides a new message until the delay it was sent with lapses", async () => {
    // Given a queue holding a message sent with a delay.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        DelaySeconds: 60,
      }),
    );

    // When a consumer receives before the delay lapses, and again after.
    const early = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    await simAws.clock().advanceBy({ seconds: 61 });

    const late = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // Then the message only arrives once the delay is over.
    assertUndefined(early.Messages);
    assertIdentical(late.Messages?.[0]?.Body, "order-1");
  });

  it("delays every message on a queue with a delay of its own", async () => {
    // Given a queue with a delay and a message sent with none.
    const { simAws, queueUrl } = await simAwsWithQueue({ DelaySeconds: "45" });
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When a consumer receives before the queue's delay lapses, and again after.
    const early = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    await simAws.clock().advanceBy({ seconds: 46 });

    const late = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // Then the queue's delay applied to the message.
    assertUndefined(early.Messages);
    assertIdentical(late.Messages?.[0]?.Body, "order-1");
  });

  it("returns one message at a time unless asked for more", async () => {
    // Given a queue holding three messages.
    const { simAws, queueUrl } = await simAwsWithQueue();
    for (const body of ["order-1", "order-2", "order-3"]) {
      // oxlint-disable-next-line no-await-in-loop
      await simAws
        .sqs()
        .sendMessage(
          new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }),
        );
    }

    // When one receive takes the default and the next asks for two.
    const one = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    const two = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 2,
      }),
    );

    // Then each receive hands out what it asked for, oldest first.
    assertArrayEquals(
      one.Messages?.map((message) => message.Body),
      ["order-1"],
    );
    assertArrayEquals(
      two.Messages?.map((message) => message.Body),
      ["order-2", "order-3"],
    );
  });

  it("hides received messages for the timeout a request asks for", async () => {
    // Given a queue with a short visibility timeout holding a message.
    const { simAws, queueUrl } = await simAwsWithQueue({
      VisibilityTimeout: "5",
    });
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When the consumer asks for longer than the queue's own timeout.
    await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        VisibilityTimeout: 600,
      }),
    );

    await simAws.clock().advanceBy({ seconds: 30 });

    const empty = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // Then the message stays hidden past the queue's timeout.
    assertUndefined(empty.Messages);
  });

  it("drops a message whose retention period has run out", async () => {
    // Given a queue holding a message, with the shortest retention SQS allows.
    const { simAws, queueUrl } = await simAwsWithQueue({
      MessageRetentionPeriod: "60",
    });
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // When simulated time moves past the retention period.
    await simAws.clock().advanceBy({ seconds: 61 });

    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // Then the message is gone, as real SQS drops it.
    assertUndefined(received.Messages);
  });

  it("takes only the messages that are visible", async () => {
    // Given a queue holding a delayed message and a visible one.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "later",
        DelaySeconds: 60,
      }),
    );
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "now" }),
      );

    // When several messages are asked for.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
      }),
    );

    // Then only the visible one is handed out.
    assertArrayLength(received.Messages ?? [], 1);
    assertIdentical(received.Messages?.[0]?.Body, "now");
  });
});

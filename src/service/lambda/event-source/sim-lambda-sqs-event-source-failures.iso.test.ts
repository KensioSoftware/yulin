import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithSqsEventSource } from "../../../../test/lambda/event-source-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";

function throwing(): never {
  throw new Error("Consumer could not handle the batch");
}

describe("sim Lambda SQS event source mapping failures", () => {
  it("leaves a batch the handler threw on for its visibility timeout", async () => {
    // Given a queue mapped to a function that cannot handle what it is given.
    const { simAws, queueUrl, events } = await simAwsWithSqsEventSource({
      queueAttributes: { VisibilityTimeout: "30" },
      handlerResult: throwing,
    });

    // When a message is sent and the handler throws on it.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    assertArrayLength(events, 1);

    // Then the message is still on the queue, hidden while the timeout runs.
    const hidden = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertUndefined(hidden.Messages);
  });

  it("delivers the batch again once the visibility timeout lapses", async () => {
    // Given a queue whose mapped function threw on a message.
    const { simAws, queueUrl, events } = await simAwsWithSqsEventSource({
      queueAttributes: { VisibilityTimeout: "30" },
      handlerResult: throwing,
    });

    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // When simulated time reaches the end of the visibility timeout.
    await simAws.clock().advanceBy({ seconds: 31 });

    // Then the same message was handed to the function again.
    assertArrayLength(events, 2);
    assertIdentical(events[1].Records[0]?.body, "order-1");
    assertIdentical(
      events[1].Records[0].attributes["ApproximateReceiveCount"],
      "2",
    );
  });

  it("redrives a message the handler keeps throwing on", async () => {
    // Given a queue that gives up after two receives, mapped to a function
    // that cannot handle anything.
    const simAws = new SimAws();

    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders-dlq" }));

    const deadLetterQueueArn = simAws.sqs().findQueue("orders-dlq")?.arn.value;

    assertNonNullable(deadLetterQueueArn);

    const { queueUrl } = await simAwsWithSqsEventSource({
      simAws,
      queueAttributes: {
        VisibilityTimeout: "30",
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: deadLetterQueueArn,
          maxReceiveCount: 2,
        }),
      },
      handlerResult: throwing,
    });

    // When the message has been delivered and thrown on twice.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ seconds: 31 });
    await simAws.clock().advanceBy({ seconds: 31 });

    // Then it is on the dead-letter queue rather than the source queue.
    const dead = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: simAws.sqs().findQueue("orders-dlq")?.url,
      }),
    );

    assertIdentical(dead.Messages?.[0]?.Body, "order-1");
  });

  it("deletes the rest of a batch a function reports item failures for", async () => {
    // Given a mapping told the function reports its own batch item failures.
    const { simAws, queueUrl, events } = await simAwsWithSqsEventSource({
      queueAttributes: { VisibilityTimeout: "30" },
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: (event) => ({
        batchItemFailures: event.Records.filter(
          (record) => record.body === "order-2",
        ).map((record) => ({ itemIdentifier: record.messageId })),
      }),
    });

    // When a batch of two arrives and the function fails one of them.
    await simAws.sqs().sendMessageBatch({
      input: {
        QueueUrl: queueUrl,
        Entries: [
          { Id: "1", MessageBody: "order-1" },
          { Id: "2", MessageBody: "order-2" },
        ],
      },
    });
    await simAws.backgroundTasksComplete();

    const firstDelivery = events.length;

    // Then only the reported one comes back once its visibility lapses.
    await simAws.clock().advanceBy({ seconds: 31 });

    assertIdentical(firstDelivery, 1);
    assertArrayLength(events, 2);

    const redelivered = events[1].Records;

    assertArrayLength(redelivered, 1);
    assertIdentical(redelivered[0].body, "order-2");
  });

  it("returns the whole batch when the report names a message it was not given", async () => {
    // Given a function reporting a failure for a message id from nowhere.
    const { simAws, queueUrl, events } = await simAwsWithSqsEventSource({
      queueAttributes: { VisibilityTimeout: "30" },
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: () => ({
        batchItemFailures: [{ itemIdentifier: "not-a-message-in-this-batch" }],
      }),
    });

    // When a message is delivered to it.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ seconds: 31 });

    // Then the message it was given comes back rather than being deleted on a
    // report that cannot be trusted.
    assertArrayLength(events, 2);
    assertIdentical(events[1].Records[0]?.body, "order-1");
  });

  it("deletes the batch when the function reports no item failures", async () => {
    // Given a function reporting an empty list of batch item failures.
    const { simAws, queueUrl } = await simAwsWithSqsEventSource({
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: () => ({ batchItemFailures: [] }),
    });

    // When a message is delivered to it.
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

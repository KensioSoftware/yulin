import {
  GetQueueAttributesCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithConsumingService } from "../../../../../test/ecs/consuming-service-fixture.js";

describe("A simulated ECS container consuming a queue", () => {
  it("hands a message sent to its queue to the bound handler", async () => {
    // Given a running service whose container consumes a queue.
    const { simAws, queueUrl, batches } = await simAwsWithConsumingService();

    // When a message is sent to it.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // Then the handler was given it, as the queue reports it.
    assertArrayLength(batches, 1);
    assertArrayLength(batches[0], 1);
    assertIdentical(batches[0][0].Body, "order-1");
  });

  it("deletes the messages of a batch the handler returned from", async () => {
    // Given a running service whose container consumes a queue.
    const { simAws, queueUrl } = await simAwsWithConsumingService();

    // When it handles a message.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // Then nothing is left on the queue, in flight or otherwise.
    const attributes = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["All"],
      }),
    );

    const counts = attributes.Attributes ?? {};

    assertIdentical(counts["ApproximateNumberOfMessages"], "0");
    assertIdentical(counts["ApproximateNumberOfMessagesNotVisible"], "0");
  });

  it("delivers what was already waiting when the service started", async () => {
    // Given a queue holding a message before anything consumes it.
    const { simAws, queueUrl, batches } = await simAwsWithConsumingService({
      desiredCount: 0,
    });

    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    const beforeScalingOut = batches.length;

    // When a service scales out onto it.
    await simAws.ecs().updateService({
      input: { service: "orders-worker", desiredCount: 1 },
    });
    await simAws.backgroundTasksComplete();

    // Then the message that was already there is handled.
    assertIdentical(beforeScalingOut, 0);
    assertArrayLength(batches, 1);
    assertArrayLength(batches[0], 1);
    assertIdentical(batches[0][0].Body, "order-1");
  });
});

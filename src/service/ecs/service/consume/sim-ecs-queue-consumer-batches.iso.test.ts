import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithConsumingService } from "../../../../../test/ecs/consuming-service-fixture.js";

describe("What a simulated ECS container's queue batches carry", () => {
  it("hands over no more than the batch size at once", async () => {
    // Given a container consuming two messages at a time.
    const { simAws, queueUrl, batches } = await simAwsWithConsumingService({
      batchSize: 2,
    });

    // When five messages are sent.
    for (const body of ["1", "2", "3", "4", "5"]) {
      // oxlint-disable-next-line no-await-in-loop
      await simAws
        .sqs()
        .sendMessage(
          new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }),
        );
    }

    await simAws.backgroundTasksComplete();

    // Then every message arrived, in batches of no more than two.
    const handled = batches.flat();

    assertArrayLength(handled, 5);

    for (const batch of batches) {
      assertTrue(batch.length <= 2);
    }
  });

  it("calls the handler once per poll however many tasks the service runs", async () => {
    // Given a service keeping three tasks of one consuming container.
    const { simAws, queueUrl, batches } = await simAwsWithConsumingService({
      desiredCount: 3,
    });

    // When one message is sent.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // Then it was handled once, as three real containers sharing a queue would
    // between them, rather than once per task.
    assertArrayLength(batches, 1);
    assertArrayLength(batches[0], 1);
  });

  it("gives the handler the container's environment and Region", async () => {
    // Given a consuming container declaring an environment variable.
    const seen: Record<string, string | undefined> = {};
    const { simAws, queueUrl } = await simAwsWithConsumingService({
      environment: [{ name: "ORDERS_TOPIC", value: "orders-v2" }],
      onBatch: (): void => {
        seen["topic"] = process.env["ORDERS_TOPIC"];
        seen["region"] = process.env["AWS_REGION"];
      },
    });

    // When it handles a message.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // Then the handler read what the deployed container would.
    assertIdentical(seen["topic"], "orders-v2");
    assertIdentical(seen["region"], simAws.defaultRegionName);
  });
});

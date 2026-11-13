import { PutRecordsCommand } from "@aws-sdk/client-kinesis";
import { GetEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import { SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithSqsEventSource } from "../../../../test/lambda/event-source-fixture.js";
import { simAwsWithKinesisEventSource } from "../../../../test/lambda/kinesis-event-source-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";

function ordersFrom(
  start: number,
  count: number,
): { Id: string; MessageBody: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    Id: String(index),
    MessageBody: `order-${String(start + index)}`,
  }));
}

async function sendOrders(
  simAws: SimAws,
  queueUrl: string,
  count: number,
): Promise<void> {
  for (let start = 0; start < count; start += 10) {
    const entries = ordersFrom(start, Math.min(10, count - start));
    // oxlint-disable-next-line no-await-in-loop -- sent in order
    await simAws
      .sqs()
      .sendMessageBatch(
        new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: entries }),
      );
  }
  await simAws.backgroundTasksComplete();
}

describe("an event source mapping's batching window", () => {
  it("holds a partial queue batch until the window closes", async () => {
    // Given a queue mapping gathering up to fifty messages over five seconds.
    const { simAws, queueUrl, uuid, events } = await simAwsWithSqsEventSource({
      batchSize: 50,
      batchingWindowSeconds: 5,
    });
    await simAws.backgroundTasksComplete();

    // When three messages arrive, and then the window passes.
    await sendOrders(simAws, queueUrl, 3);
    const beforeWindow = events.length;
    await simAws.clock().advanceBy({ seconds: 5 });

    // Then nothing was delivered before the window closed, and the three
    // went in one batch after, which the mapping reports the window for.
    assertIdentical(beforeWindow, 0);
    assertArrayEquals(
      events.map((event) => event.Records.length),
      [3],
    );
    const mapping = await simAws
      .lambda()
      .getEventSourceMapping(new GetEventSourceMappingCommand({ UUID: uuid }));
    assertIdentical(mapping.MaximumBatchingWindowInSeconds, 5);
  });

  it("delivers a queue batch as soon as it is full", async () => {
    // Given a queue mapping gathering twenty messages over a minute.
    const { simAws, queueUrl, events } = await simAwsWithSqsEventSource({
      batchSize: 20,
      batchingWindowSeconds: 60,
    });
    await simAws.backgroundTasksComplete();

    // When twenty arrive.
    await sendOrders(simAws, queueUrl, 20);

    // Then they went in one batch without waiting.
    assertArrayEquals(
      events.map((event) => event.Records.length),
      [20],
    );
  });

  it("holds a partial stream batch until the window closes", async () => {
    // Given a Kinesis mapping gathering records over ten seconds.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      batchingWindowSeconds: 10,
    });
    await simAws.backgroundTasksComplete();

    // When two records arrive.
    await simAws.kinesis().putRecords(
      new PutRecordsCommand({
        StreamName: "orders",
        Records: ["order-1", "order-2"].map((order) => ({
          PartitionKey: "order",
          Data: new TextEncoder().encode(order),
        })),
      }),
    );
    await simAws.backgroundTasksComplete();
    const beforeWindow = [...events];
    await simAws.clock().advanceBy({ seconds: 10 });

    // Then they were held, and delivered together once it closed.
    assertArrayEmpty(beforeWindow);
    assertArrayEquals(
      events.map((event) => event.Records.length),
      [2],
    );
  });
});

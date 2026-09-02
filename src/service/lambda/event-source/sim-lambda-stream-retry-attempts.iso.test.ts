import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import { assertArrayEquals, assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithKinesisEventSource } from "../../../../test/lambda/kinesis-event-source-fixture.js";
import { simAwsWithStreamEventSource } from "../../../../test/lambda/stream-event-source-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaDynamoDbStreamEvent } from "./poll/sim-lambda-dynamodb-stream-event.types.js";

/**
 * A handler that never gets through a batch, which is what makes the retries
 * the only thing deciding how many deliveries there are.
 */
function throwing(): never {
  throw new Error("Projector could not handle the batch");
}

/**
 * Write one order to the table, which is one record on its stream.
 */
async function writeOrder(
  simAws: SimAws,
  tableName: string,
  orderId: string,
): Promise<void> {
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: tableName,
      Item: { orderId: { S: orderId } },
    }),
  );
}

/**
 * Put one order onto the stream, on the shard the other orders go to.
 */
async function putOrder(simAws: SimAws, orderId: string): Promise<void> {
  await simAws.kinesis().putRecord(
    new PutRecordCommand({
      StreamName: "orders",
      PartitionKey: "customer-1",
      Data: new TextEncoder().encode(orderId),
    }),
  );
}

/**
 * The orders each delivery carried, one line per delivery.
 */
function deliveries(
  events: readonly SimLambdaDynamoDbStreamEvent[],
): readonly string[] {
  return events.map((event) =>
    event.Records.map(
      (record) => record.dynamodb.Keys?.["orderId"]?.S ?? "",
    ).join(", "),
  );
}

describe("the retries a stream event source mapping allows a failed batch", () => {
  it("makes one delivery and no retries when the mapping allows none", async () => {
    // Given a stream mapping that allows a failed batch no retries at all,
    // whose handler cannot get through a batch.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: throwing,
      maximumRetryAttempts: 0,
    });

    // When a change is written and an hour of simulated time passes.
    await writeOrder(simAws, tableName, "order-1");
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the batch was handed over once and discarded, rather than waiting
    // out the retries a mapping that asked for no limit would have had.
    assertArrayLength(events, 1);
  });

  it("carries on with the stream once a batch has had its retries", async () => {
    // Given a stream mapping that allows a failed batch no retries.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: throwing,
      maximumRetryAttempts: 0,
    });

    // When one change is written, given up on, and another written behind it.
    await writeOrder(simAws, tableName, "order-1");
    await simAws.backgroundTasksComplete();
    await writeOrder(simAws, tableName, "order-2");
    await simAws.backgroundTasksComplete();

    // Then the discarded record moved the checkpoint, so the record behind it
    // was delivered rather than waiting behind a batch nothing will handle.
    assertArrayEquals(deliveries(events), ["order-1", "order-2"]);
  });

  it("allows exactly the retries a stream mapping asked for", async () => {
    // Given a stream mapping that allows a failed batch two retries.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: throwing,
      maximumRetryAttempts: 2,
    });

    // When a change is written and an hour of simulated time passes.
    await writeOrder(simAws, tableName, "order-1");
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the batch was handed over once and then twice more, after 1 and 2
    // seconds, rather than the five times a mapping with no limit gets.
    assertArrayLength(events, 3);
  });

  it("allows exactly the retries a Kinesis mapping asked for", async () => {
    // Given a Kinesis mapping that allows a failed batch one retry.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      handlerResult: throwing,
      maximumRetryAttempts: 1,
    });

    // When a record is put onto the stream and an hour of simulated time
    // passes.
    await putOrder(simAws, "order-1");
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the batch was handed over once and then once more.
    assertArrayLength(events, 2);
  });

  it("counts a redelivery from a reported record against the same retries", async () => {
    // Given a mapping allowing one retry, whose handler always reports the
    // second record of whatever batch it is given.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      functionResponseTypes: ["ReportBatchItemFailures"],
      maximumRetryAttempts: 1,
      handlerResult: (event: SimLambdaDynamoDbStreamEvent): unknown => ({
        batchItemFailures: [
          { itemIdentifier: event.Records[1]?.dynamodb.SequenceNumber },
        ],
      }),
    });

    // When three changes are written and an hour of simulated time passes.
    await writeOrder(simAws, tableName, "order-1");
    await writeOrder(simAws, tableName, "order-2");
    await writeOrder(simAws, tableName, "order-3");
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the report sent the batch back to the record it named, and that
    // redelivery was the one retry the mapping allows rather than a fresh
    // start on a smaller batch.
    assertArrayEquals(deliveries(events).slice(-2), [
      "order-1, order-2, order-3",
      "order-2, order-3",
    ]);
  });

  it("keeps the five retries a mapping asking for no limit has always had", async () => {
    // Given a stream mapping that asks for no limit on either retries or
    // record age, which is what Lambda's own -1 means.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: throwing,
      maximumRetryAttempts: -1,
      maximumRecordAgeInSeconds: -1,
    });

    // When a change is written and an hour of simulated time passes.
    await writeOrder(simAws, tableName, "order-1");
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the batch was delivered again five times, after 1, 2, 4, 8 and 16
    // seconds, which is the cap that keeps a handler that always throws from
    // leaving the clock with work falling due forever.
    assertArrayLength(events, 6);
  });
});

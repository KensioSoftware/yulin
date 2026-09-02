import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import {
  assertArrayEquals,
  assertArrayIncludes,
  assertArrayLength,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithKinesisEventSource } from "../../../../test/lambda/kinesis-event-source-fixture.js";
import { simAwsWithStreamEventSource } from "../../../../test/lambda/stream-event-source-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaKinesisStreamEvent } from "./poll/kinesis/sim-lambda-kinesis-stream-event.types.js";
import type { SimLambdaDynamoDbStreamEvent } from "./poll/sim-lambda-dynamodb-stream-event.types.js";

/**
 * A handler that never gets through a batch, so the record age is the only
 * thing that ends the retries.
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
  await simAws.backgroundTasksComplete();
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
  await simAws.backgroundTasksComplete();
}

/**
 * The orders each delivery of a DynamoDB stream batch carried.
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

/**
 * The orders each delivery of a Kinesis batch carried.
 */
function kinesisDeliveries(
  events: readonly SimLambdaKinesisStreamEvent[],
): readonly string[] {
  return events.map((event) =>
    event.Records.map((record) =>
      Buffer.from(record.kinesis.data, "base64").toString("utf8"),
    ).join(", "),
  );
}

describe("the record age a stream event source mapping keeps delivering", () => {
  it("stops delivering a record once the next attempt would be past its age", async () => {
    // Given a stream mapping that discards records older than ten seconds,
    // whose handler cannot get through a batch.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: throwing,
      maximumRecordAgeInSeconds: 10,
    });

    // When a change is written and an hour of simulated time passes.
    await writeOrder(simAws, tableName, "order-1");
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the record was handed over at 0, 1, 3 and 7 seconds, and the
    // attempt that would have fallen at 15 seconds was not made, because the
    // record would have been older by then than the mapping carries.
    assertArrayLength(events, 4);
  });

  it("carries on with the stream once its records have aged out", async () => {
    // Given a stream mapping that discards records older than ten seconds.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: throwing,
      maximumRecordAgeInSeconds: 10,
    });

    // When one change ages out and another is written behind it.
    await writeOrder(simAws, tableName, "order-1");
    await simAws.clock().advanceBy({ minutes: 1 });
    await writeOrder(simAws, tableName, "order-2");

    // Then the aged-out record moved the checkpoint, so the record behind it
    // was delivered rather than waiting behind one nothing will handle.
    assertArrayIncludes(deliveries(events), "order-2");
  });

  it("leaves behind only the records that have aged out", async () => {
    // Given a stream mapping that discards records older than a minute, whose
    // handler cannot get through a batch, so nothing ever leaves the batch by
    // being handled.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: throwing,
      maximumRecordAgeInSeconds: 60,
    });

    // When one change is written, and a second thirty seconds later, so the
    // two records of the blocked batch age out thirty seconds apart.
    await writeOrder(simAws, tableName, "order-1");
    await simAws.clock().advanceBy({ seconds: 30 });
    await writeOrder(simAws, tableName, "order-2");

    // When an hour of simulated time passes.
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the batch carried both records while both were young enough, and
    // the older one was left behind on its own, so the younger one went on
    // being delivered rather than being discarded alongside it.
    assertArrayEquals(deliveries(events).slice(-2), [
      "order-1, order-2",
      "order-2",
    ]);
  });

  it("stops delivering a Kinesis record once it is past its age", async () => {
    // Given a Kinesis mapping that discards records older than ten seconds,
    // whose handler cannot get through a batch.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      handlerResult: throwing,
      maximumRecordAgeInSeconds: 10,
    });

    // When a record is put on, ages out, and another is put on behind it.
    await putOrder(simAws, "order-1");
    await simAws.clock().advanceBy({ minutes: 1 });
    await putOrder(simAws, "order-2");

    // Then the shard carried on rather than stalling on the record nothing
    // will handle.
    assertArrayIncludes(kinesisDeliveries(events), "order-2");
  });
});

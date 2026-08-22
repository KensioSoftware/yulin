import { PutRecordCommand, PutRecordsCommand } from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertSetSize,
  assertStringStartsWith,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithKinesisEventSource } from "../../../../test/lambda/kinesis-event-source-fixture.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaKinesisStreamEvent } from "./poll/kinesis/sim-lambda-kinesis-stream-event.types.js";

const startedAt = new Date("2026-08-22T09:00:00.000Z");

/**
 * Put one order onto the stream, under a partition key of its own.
 */
async function putOrder(simAws: SimAws, id: string): Promise<void> {
  await simAws.kinesis().putRecord(
    new PutRecordCommand({
      StreamName: "orders",
      PartitionKey: id,
      Data: new TextEncoder().encode(id),
    }),
  );
}

/**
 * What every delivered record carried, in the order the function saw it.
 */
function deliveredData(
  events: readonly SimLambdaKinesisStreamEvent[],
): readonly string[] {
  return events
    .flatMap((event) => event.Records)
    .map((record) => Buffer.from(record.kinesis.data, "base64").toString());
}

describe("sim Lambda Kinesis stream event source mappings", () => {
  it("delivers a record put on the stream as a Kinesis event", async () => {
    // Given a Kinesis stream mapped to a function.
    const { simAws, streamArn, events } = await simAwsWithKinesisEventSource({
      simAws: new SimAws({ clock: new SimFixedClock(startedAt) }),
    });

    // When a record is put onto the stream.
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode('{"id":"order-1"}'),
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the handler was given one real-shaped Kinesis record.
    assertArrayLength(events, 1);

    const record = events[0].Records[0];
    assertNonNullable(record);
    assertIdentical(record.eventSource, "aws:kinesis");
    assertIdentical(record.eventName, "aws:kinesis:record");
    assertIdentical(record.eventSourceARN, streamArn);
    assertIdentical(record.awsRegion, simAws.defaultRegionName);
    assertStringStartsWith(record.eventID, "shardId-000000000000:");

    // And the payload is base64 of what was put, with the arrival in epoch
    // seconds rather than as an instant.
    const { kinesis } = record;
    assertIdentical(kinesis.kinesisSchemaVersion, "1.0");
    assertIdentical(kinesis.partitionKey, "customer-1");
    assertIdentical(
      Buffer.from(kinesis.data, "base64").toString("utf8"),
      '{"id":"order-1"}',
    );
    assertIdentical(
      kinesis.approximateArrivalTimestamp,
      startedAt.getTime() / 1000,
    );
  });

  it("delivers every record of a stream with more than one shard", async () => {
    // Given a stream with four shards mapped to a function.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      shardCount: 4,
    });

    // When twenty records are put under different partition keys, which spreads
    // them across the shards.
    await simAws.kinesis().putRecords(
      new PutRecordsCommand({
        StreamName: "orders",
        Records: Array.from({ length: 20 }, (_unused, index) => ({
          PartitionKey: `customer-${index}`,
          Data: new TextEncoder().encode(`order-${index}`),
        })),
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then every record reached the function, whichever shard it landed on.
    const delivered = events
      .flatMap((event) => event.Records)
      .map((record) => Buffer.from(record.kinesis.data, "base64").toString());
    assertArrayLength(delivered, 20);
    assertSetSize(new Set(delivered), 20);
  });

  it("delivers a batch of records in one invocation up to the batch size", async () => {
    // Given a stream mapped to a function taking three records at a time.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      batchSize: 3,
    });

    // When five records are put under one partition key, so all are on one
    // shard and their order is fixed.
    await simAws.kinesis().putRecords(
      new PutRecordsCommand({
        StreamName: "orders",
        Records: Array.from({ length: 5 }, (_unused, index) => ({
          PartitionKey: "customer-1",
          Data: new TextEncoder().encode(`order-${index}`),
        })),
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then they arrived as a batch of three and then a batch of two, in the
    // order they were put.
    assertArrayLength(events, 2);
    assertArrayLength(events[0].Records, 3);
    assertArrayLength(events[1].Records, 2);

    const delivered = events
      .flatMap((event) => event.Records)
      .map((record) => Buffer.from(record.kinesis.data, "base64").toString());
    assertIdentical(
      delivered.join(","),
      "order-0,order-1,order-2,order-3,order-4",
    );
  });

  it("delivers only what arrives next to a LATEST mapping", async () => {
    // Given a mapping created to read only what the stream takes from now on.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      startingPosition: "LATEST",
    });

    // When a record the stream already holds is followed by a new one.
    await putOrder(simAws, "order-1");
    await simAws.backgroundTasksComplete();
    await putOrder(simAws, "order-2");
    await simAws.backgroundTasksComplete();

    // Then only the one put after the mapping started reading is delivered.
    assertIdentical(deliveredData(events).join(","), "order-2");
  });

  it("delivers from an instant to an AT_TIMESTAMP mapping", async () => {
    // Given a stream holding a record put an hour before the mapping starts.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    const { events } = await simAwsWithKinesisEventSource({
      simAws,
      startingPosition: "AT_TIMESTAMP",
      startingPositionTimestamp: new Date(startedAt.getTime() + 30 * 60 * 1000),
    });

    // When a record is put before that instant and another after it.
    await putOrder(simAws, "order-1");
    await simAws.clock().advanceBy({ hours: 1 });
    await putOrder(simAws, "order-2");
    await simAws.backgroundTasksComplete();

    // Then only the later one is delivered.
    assertIdentical(deliveredData(events).join(","), "order-2");
  });
});

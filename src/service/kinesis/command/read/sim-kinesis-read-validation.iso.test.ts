import {
  GetRecordsCommand,
  GetShardIteratorCommand,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimKinesisInvalidArgumentException,
  SimKinesisResourceNotFoundException,
} from "../../error/sim-kinesis.error.js";
import { simKinesisStreamFactory } from "../../stream/sim-kinesis-stream.factory.js";

/**
 * The error a call raised, as the assertions here want it.
 */
async function refusalFrom(
  call: () => Promise<unknown>,
): Promise<SimKinesisInvalidArgumentException> {
  const error = await assertThrowsErrorAsync(call);
  assertInstanceOf(error, SimKinesisInvalidArgumentException);

  return error;
}

describe("What simulated Kinesis refuses of a read request", () => {
  it("refuses a shard iterator type Kinesis does not have", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When an iterator of an unknown type is asked for. The SDK's own types
    // refuse to build this command, so the request is made structurally.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().getShardIterator({
        input: {
          StreamName: "orders",
          ShardId: "shardId-000000000000",
          ShardIteratorType: "AT_THE_BEGINNING",
        },
      });
    });

    // Then it is refused, listing the types it has.
    assertStringIncludes(error.message, "TRIM_HORIZON");
  });

  it("refuses a sequence number iterator with no sequence number", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When an AT_SEQUENCE_NUMBER iterator is asked for without one.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().getShardIterator(
        new GetShardIteratorCommand({
          StreamName: "orders",
          ShardId: "shardId-000000000000",
          ShardIteratorType: "AT_SEQUENCE_NUMBER",
        }),
      );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "StartingSequenceNumber");
  });

  it("refuses a timestamp iterator with no timestamp", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When an AT_TIMESTAMP iterator is asked for without one.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().getShardIterator(
        new GetShardIteratorCommand({
          StreamName: "orders",
          ShardId: "shardId-000000000000",
          ShardIteratorType: "AT_TIMESTAMP",
        }),
      );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "Timestamp");
  });

  it("refuses a shard the stream does not have", async () => {
    // Given a stream with one shard.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When an iterator onto a second shard is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.kinesis().getShardIterator(
        new GetShardIteratorCommand({
          StreamName: "orders",
          ShardId: "shardId-000000000001",
          ShardIteratorType: "TRIM_HORIZON",
        }),
      );
    });

    // Then it is not found.
    assertInstanceOf(error, SimKinesisResourceNotFoundException);
  });

  it("refuses an iterator request with no shard", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When an iterator is asked for without naming a shard. The SDK requires
    // one, so the request is made structurally.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().getShardIterator({
        input: { StreamName: "orders", ShardIteratorType: "TRIM_HORIZON" },
      });
    });

    // Then it is refused.
    assertStringIncludes(error.message, "requires a ShardId");
  });

  it("refuses a read limit outside what one GetRecords call hands back", async () => {
    // Given a stream, and an iterator onto its only shard.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);
    const iterator = await simAws.kinesis().getShardIterator(
      new GetShardIteratorCommand({
        StreamName: "orders",
        ShardId: "shardId-000000000000",
        ShardIteratorType: "TRIM_HORIZON",
      }),
    );

    // When records are read with a limit above what Kinesis hands back.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().getRecords(
        new GetRecordsCommand({
          ShardIterator: iterator.ShardIterator,
          Limit: 10_001,
        }),
      );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "Limit 10001");
  });

  it("refuses a timestamp that is not a date", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When an AT_TIMESTAMP iterator is asked for with an unparseable date.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().getShardIterator(
        new GetShardIteratorCommand({
          StreamName: "orders",
          ShardId: "shardId-000000000000",
          ShardIteratorType: "AT_TIMESTAMP",
          Timestamp: new Date("the day before yesterday"),
        }),
      );
    });

    // Then it is refused, rather than standing at a position nothing compares
    // true against and quietly reading nothing.
    assertStringIncludes(error.message, "a date");
  });

  it("refuses a read naming a stream the iterator was not made on", async () => {
    // Given two streams, and an iterator onto the first.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);
    await simKinesisStreamFactory.make({ streamName: "events" }, simAws);
    const iterator = await simAws.kinesis().getShardIterator(
      new GetShardIteratorCommand({
        StreamName: "orders",
        ShardId: "shardId-000000000000",
        ShardIteratorType: "TRIM_HORIZON",
      }),
    );

    // When records are read with that iterator under the other stream's ARN.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().getRecords(
        new GetRecordsCommand({
          ShardIterator: iterator.ShardIterator,
          StreamARN: `arn:aws:kinesis:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stream/events`,
        }),
      );
    });

    // Then it is refused, rather than reading the iterator's stream under a
    // name the caller believed was a different one.
    assertStringIncludes(error.message, "not the stream the ShardIterator");
  });

  it("reads through an iterator whose stream ARN agrees with it", async () => {
    // Given a stream holding a record.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode("order-1"),
      }),
    );
    const iterator = await simAws.kinesis().getShardIterator(
      new GetShardIteratorCommand({
        StreamName: "orders",
        ShardId: "shardId-000000000000",
        ShardIteratorType: "TRIM_HORIZON",
      }),
    );

    // When records are read naming that same stream.
    const read = await simAws.kinesis().getRecords(
      new GetRecordsCommand({
        ShardIterator: iterator.ShardIterator,
        StreamARN: `arn:aws:kinesis:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stream/orders`,
      }),
    );

    // Then the record comes back.
    assertArrayLength(read.Records, 1);
  });
});

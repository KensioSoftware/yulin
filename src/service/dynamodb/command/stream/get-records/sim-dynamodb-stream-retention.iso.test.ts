import { UpdateTableCommand } from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  ListStreamsCommand,
  type ShardIteratorType,
} from "@aws-sdk/client-dynamodb-streams";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimDynamoDbTrimmedDataAccessException } from "../../../error/dynamodb.error.js";
import type { SimDynamoDbStream } from "../../../stream/sim-dynamodb-stream.js";
import { simDynamoDbStreamedOrdersFactory } from "../../../stream/sim-dynamodb-streamed-orders.factory.js";

/**
 * The instant these tests start from.
 */
const startedAt = new Date("2026-08-04T09:00:00.000Z");

/**
 * The sequence number the record at a position on a fresh stream carries.
 */
function sequenceNumberAt(position: number): string {
  return (100_000_000_000_000_000_000n + BigInt(position)).toString();
}

interface AgedStream {
  readonly simAws: SimAws;
  readonly stream: SimDynamoDbStream;
}

/**
 * A stream with two records on it, written on a clock a test can move.
 */
async function agedStream(): Promise<AgedStream> {
  const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });

  return {
    simAws,
    stream: await simDynamoDbStreamedOrdersFactory.make({ orders: 2 }, simAws),
  };
}

/**
 * An iterator for the one shard of a stream, of a type and at a place.
 */
async function iteratorFor(
  aged: AgedStream,
  iteratorType: ShardIteratorType,
  sequenceNumber?: string,
): Promise<string | undefined> {
  const output = await aged.simAws.dynamoDbStreams().getShardIterator(
    new GetShardIteratorCommand({
      StreamArn: aged.stream.arn,
      ShardId: aged.stream.shard.shardId,
      ShardIteratorType: iteratorType,
      SequenceNumber: sequenceNumber,
    }),
  );

  return output.ShardIterator;
}

describe("DynamoDB Streams 24 hour retention", () => {
  it("raises TrimmedDataAccessException for a position past the trim point", async () => {
    // Given an iterator taken at the first record, held while a day passes.
    const aged = await agedStream();
    const iterator = await iteratorFor(
      aged,
      "AT_SEQUENCE_NUMBER",
      sequenceNumberAt(0),
    );
    await aged.simAws.clock().advanceBy({ hours: 25 });

    // When the reader comes back with the iterator it was holding.
    const error = await assertThrowsErrorAsync(async () =>
      aged.simAws
        .dynamoDbStreams()
        .getRecords(new GetRecordsCommand({ ShardIterator: iterator })),
    );

    // Then it is told the records it wanted have been trimmed, rather than
    // being quietly given whatever is left.
    assertInstanceOf(error, SimDynamoDbTrimmedDataAccessException);
  });

  it("refuses a sequence number that has already been trimmed", async () => {
    // Given a stream whose records have all aged out.
    const aged = await agedStream();
    await aged.simAws.clock().advanceBy({ hours: 25 });

    // When an iterator is asked for at one of them.
    const error = await assertThrowsErrorAsync(async () =>
      iteratorFor(aged, "AT_SEQUENCE_NUMBER", sequenceNumberAt(1)),
    );

    // Then it is refused at the call that asked, rather than one call later.
    assertInstanceOf(error, SimDynamoDbTrimmedDataAccessException);
  });

  it("leaves a trimmed stream listable and readable from TRIM_HORIZON", async () => {
    // Given a stream whose records have all aged out.
    const aged = await agedStream();
    await aged.simAws.clock().advanceBy({ hours: 25 });

    // When it is listed and then read from the oldest record it still holds.
    const listed = await aged.simAws
      .dynamoDbStreams()
      .listStreams(new ListStreamsCommand({ TableName: "orders" }));
    const iterator = await iteratorFor(aged, "TRIM_HORIZON");
    const output = await aged.simAws
      .dynamoDbStreams()
      .getRecords(new GetRecordsCommand({ ShardIterator: iterator }));

    // Then the stream is still there and still readable, with nothing on it.
    assertArrayLength(listed.Streams, 1);
    assertIdentical(listed.Streams[0].StreamArn, aged.stream.arn);
    assertArrayEmpty(output.Records);
    assertNonNullable(output.NextShardIterator);
  });

  it("goes on reporting the range of a shard whose records have gone", async () => {
    // Given a closed shard whose records have all aged out.
    const aged = await agedStream();
    await aged.simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        StreamSpecification: { StreamEnabled: false },
      }),
    );
    await aged.simAws.backgroundTasksComplete();
    await aged.simAws.clock().advanceBy({ hours: 25 });

    // When the stream is described.
    const output = await aged.simAws
      .dynamoDbStreams()
      .describeStream(
        new DescribeStreamCommand({ StreamArn: aged.stream.arn }),
      );

    // Then the shard still says where it began and where it ended. A shard's
    // range is fixed as its records go on, and trimming takes records away
    // rather than moving it.
    const range = output.StreamDescription?.Shards?.[0]?.SequenceNumberRange;
    assertNonNullable(range);
    assertIdentical(range.StartingSequenceNumber, sequenceNumberAt(0));
    assertIdentical(range.EndingSequenceNumber, sequenceNumberAt(1));
  });

  it("keeps records that are still inside the retention window", async () => {
    // Given a stream read part of the way through, less than a day ago.
    const aged = await agedStream();
    await aged.simAws.clock().advanceBy({ hours: 23 });

    // When it is read from the second record.
    const iterator = await iteratorFor(
      aged,
      "AT_SEQUENCE_NUMBER",
      sequenceNumberAt(1),
    );
    const output = await aged.simAws
      .dynamoDbStreams()
      .getRecords(new GetRecordsCommand({ ShardIterator: iterator }));

    // Then it is still there.
    assertArrayLength(output.Records, 1);
    assertIdentical(
      output.Records[0].dynamodb?.Keys?.["orderId"]?.S,
      "order-2",
    );
  });
});

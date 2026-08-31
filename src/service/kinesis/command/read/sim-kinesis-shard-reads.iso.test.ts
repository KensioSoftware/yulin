import {
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  PutRecordCommand,
  type ShardIteratorType,
} from "@aws-sdk/client-kinesis";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimKinesisExpiredIteratorException } from "../../error/sim-kinesis.error.js";
import { simKinesisStreamFactory } from "../../stream/sim-kinesis-stream.factory.js";

const startedAt = new Date("2026-08-22T09:00:00.000Z");

/**
 * The single shard of a one shard stream.
 */
async function onlyShardId(simAws: SimAws): Promise<string> {
  const described = await simAws
    .kinesis()
    .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));

  return described.StreamDescription.Shards[0]?.ShardId ?? "";
}

/**
 * Put one record onto the stream, under a partition key of its own.
 */
async function putOrder(simAws: SimAws, id: string): Promise<string> {
  const put = await simAws.kinesis().putRecord(
    new PutRecordCommand({
      StreamName: "orders",
      PartitionKey: id,
      Data: new TextEncoder().encode(id),
    }),
  );

  return put.SequenceNumber;
}

/**
 * Read whatever an iterator of a given type reaches.
 */
async function readFrom(
  simAws: SimAws,
  input: {
    readonly ShardIteratorType: ShardIteratorType;
    readonly StartingSequenceNumber?: string;
    readonly Timestamp?: Date;
    readonly Limit?: number;
  },
): Promise<readonly string[]> {
  const iterator = await simAws.kinesis().getShardIterator(
    new GetShardIteratorCommand({
      StreamName: "orders",
      ShardId: await onlyShardId(simAws),
      ShardIteratorType: input.ShardIteratorType,
      StartingSequenceNumber: input.StartingSequenceNumber,
      Timestamp: input.Timestamp,
    }),
  );
  const read = await simAws.kinesis().getRecords(
    new GetRecordsCommand({
      ShardIterator: iterator.ShardIterator,
      Limit: input.Limit,
    }),
  );

  return read.Records.map((record) => new TextDecoder().decode(record.Data));
}

describe("Reading records off a simulated Kinesis shard", () => {
  it("reads everything on the shard from the trim horizon", async () => {
    // Given a stream holding three records.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);
    await putOrder(simAws, "order-1");
    await putOrder(simAws, "order-2");
    await putOrder(simAws, "order-3");

    // When the shard is read from the trim horizon.
    const read = await readFrom(simAws, { ShardIteratorType: "TRIM_HORIZON" });

    // Then everything on it comes back, oldest first.
    assertIdentical(read.join(","), "order-1,order-2,order-3");
  });

  it("reads only what arrives after a LATEST iterator was taken", async () => {
    // Given a stream already holding a record.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);
    await putOrder(simAws, "order-1");

    // When an iterator is taken at the tip, and a record is put after it.
    const iterator = await simAws.kinesis().getShardIterator(
      new GetShardIteratorCommand({
        StreamName: "orders",
        ShardId: await onlyShardId(simAws),
        ShardIteratorType: "LATEST",
      }),
    );
    await putOrder(simAws, "order-2");
    const read = await simAws
      .kinesis()
      .getRecords(
        new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
      );

    // Then only the later record comes back.
    assertArrayLength(read.Records, 1);
    assertIdentical(new TextDecoder().decode(read.Records[0].Data), "order-2");
  });

  it("reads at and after a sequence number a caller names", async () => {
    // Given a stream holding three records.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);
    await putOrder(simAws, "order-1");
    const second = await putOrder(simAws, "order-2");
    await putOrder(simAws, "order-3");

    // When the shard is read at and then after the second record.
    const at = await readFrom(simAws, {
      ShardIteratorType: "AT_SEQUENCE_NUMBER",
      StartingSequenceNumber: second,
    });
    const after = await readFrom(simAws, {
      ShardIteratorType: "AFTER_SEQUENCE_NUMBER",
      StartingSequenceNumber: second,
    });

    // Then the difference between the two is whether that record comes back.
    assertIdentical(at.join(","), "order-2,order-3");
    assertIdentical(after.join(","), "order-3");
  });

  it("reads from an instant a caller names", async () => {
    // Given a stream holding a record put an hour before another.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simKinesisStreamFactory.make({}, simAws);
    await putOrder(simAws, "order-1");
    await simAws.clock().advanceBy({ hours: 1 });
    await putOrder(simAws, "order-2");

    // When the shard is read from half an hour after the first.
    const read = await readFrom(simAws, {
      ShardIteratorType: "AT_TIMESTAMP",
      Timestamp: new Date(startedAt.getTime() + 30 * 60 * 1000),
    });

    // Then only the later record comes back.
    assertIdentical(read.join(","), "order-2");
  });

  it("carries on from the iterator the last read handed back", async () => {
    // Given a stream holding one record, read from the trim horizon.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);
    await putOrder(simAws, "order-1");
    const iterator = await simAws.kinesis().getShardIterator(
      new GetShardIteratorCommand({
        StreamName: "orders",
        ShardId: await onlyShardId(simAws),
        ShardIteratorType: "TRIM_HORIZON",
      }),
    );
    const first = await simAws
      .kinesis()
      .getRecords(
        new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
      );

    // When another record is put and the next iterator is read.
    await putOrder(simAws, "order-2");
    const second = await simAws
      .kinesis()
      .getRecords(
        new GetRecordsCommand({ ShardIterator: first.NextShardIterator }),
      );

    // Then only the new record comes back, and the reader is caught up.
    assertArrayLength(second.Records, 1);
    assertIdentical(
      new TextDecoder().decode(second.Records[0].Data),
      "order-2",
    );
    assertIdentical(second.MillisBehindLatest, 0);
  });

  it("reports how far behind the tip a limited read left the reader", async () => {
    // Given a stream holding two records, put five minutes apart.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simKinesisStreamFactory.make({}, simAws);
    await putOrder(simAws, "order-1");
    await simAws.clock().advanceBy({ minutes: 5 });
    await putOrder(simAws, "order-2");

    // When one record is read.
    const iterator = await simAws.kinesis().getShardIterator(
      new GetShardIteratorCommand({
        StreamName: "orders",
        ShardId: await onlyShardId(simAws),
        ShardIteratorType: "TRIM_HORIZON",
      }),
    );
    const read = await simAws.kinesis().getRecords(
      new GetRecordsCommand({
        ShardIterator: iterator.ShardIterator,
        Limit: 1,
      }),
    );

    // Then the reader is behind by the age of the record it stopped at.
    assertArrayLength(read.Records, 1);
    assertIdentical(read.MillisBehindLatest, 5 * 60 * 1000);
  });

  it("gives an empty answer to a reader that has caught up", async () => {
    // Given a stream with nothing on it.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When the shard is read from the trim horizon.
    const read = await readFrom(simAws, { ShardIteratorType: "TRIM_HORIZON" });

    // Then nothing comes back, which is an ordinary answer.
    assertArrayEmpty(read);
  });

  it("refuses a shard iterator it never issued", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When records are read with a token this simulation never made.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .kinesis()
        .getRecords(
          new GetRecordsCommand({ ShardIterator: "not-an-iterator" }),
        );
    });

    // Then it is refused the way real Kinesis refuses one it will not take.
    assertInstanceOf(error, SimKinesisExpiredIteratorException);
  });

  it("reads nothing from a LATEST iterator taken on an empty shard", async () => {
    // Given a stream with nothing on it.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When an iterator is taken at the tip, and a record is put after it.
    const iterator = await simAws.kinesis().getShardIterator(
      new GetShardIteratorCommand({
        StreamName: "orders",
        ShardId: await onlyShardId(simAws),
        ShardIteratorType: "LATEST",
      }),
    );
    await putOrder(simAws, "order-1");
    const read = await simAws
      .kinesis()
      .getRecords(
        new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
      );

    // Then the record put afterwards comes back, since there was nothing on the
    // shard for the iterator to sit after.
    assertArrayLength(read.Records, 1);
    assertIdentical(new TextDecoder().decode(read.Records[0].Data), "order-1");
  });

  it("reads nothing from a position past everything on the shard", async () => {
    // Given a stream holding one record.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simKinesisStreamFactory.make({}, simAws);
    const only = await putOrder(simAws, "order-1");

    // When the shard is read after that record, and from an hour later.
    const afterEverything = await readFrom(simAws, {
      ShardIteratorType: "AFTER_SEQUENCE_NUMBER",
      StartingSequenceNumber: only,
    });
    const laterThanEverything = await readFrom(simAws, {
      ShardIteratorType: "AT_TIMESTAMP",
      Timestamp: new Date(startedAt.getTime() + 60 * 60 * 1000),
    });

    // Then both come back empty rather than wrapping round to the start.
    assertArrayEmpty(afterEverything);
    assertArrayEmpty(laterThanEverything);
  });
});

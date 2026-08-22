import {
  DecreaseStreamRetentionPeriodCommand,
  DescribeStreamSummaryCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  IncreaseStreamRetentionPeriodCommand,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimKinesisInvalidArgumentException } from "../../error/sim-kinesis.error.js";
import { simKinesisStreamFactory } from "../../stream/sim-kinesis-stream.factory.js";

const startedAt = new Date("2026-08-22T09:00:00.000Z");

/**
 * How long the stream keeps a record now.
 */
async function retentionOf(simAws: SimAws): Promise<number> {
  const summary = await simAws
    .kinesis()
    .describeStreamSummary(
      new DescribeStreamSummaryCommand({ StreamName: "orders" }),
    );

  return summary.StreamDescriptionSummary.RetentionPeriodHours;
}

/**
 * Everything the stream's only shard still holds.
 */
async function readFromTrimHorizon(simAws: SimAws): Promise<readonly string[]> {
  const iterator = await simAws.kinesis().getShardIterator(
    new GetShardIteratorCommand({
      StreamName: "orders",
      ShardId: "shardId-000000000000",
      ShardIteratorType: "TRIM_HORIZON",
    }),
  );
  const read = await simAws
    .kinesis()
    .getRecords(
      new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
    );

  return read.Records.map((record) => new TextDecoder().decode(record.Data));
}

describe("Changing how long a simulated Kinesis stream keeps a record", () => {
  it("keeps records for longer once the retention is increased", async () => {
    // Given a stream holding a record, retaining for the default day.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simKinesisStreamFactory.make({}, simAws);
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode("order-1"),
      }),
    );

    // When the retention is increased to a week and two days pass.
    await simAws.kinesis().increaseStreamRetentionPeriod(
      new IncreaseStreamRetentionPeriodCommand({
        StreamName: "orders",
        RetentionPeriodHours: 168,
      }),
    );
    await simAws.clock().advanceBy({ hours: 48 });

    // Then the record is still there, where the default would have dropped it.
    assertIdentical(await retentionOf(simAws), 168);

    const read = await readFromTrimHorizon(simAws);
    assertIdentical(read.join(","), "order-1");
  });

  it("drops records the shortened retention has already outlived", async () => {
    // Given a stream retaining for a week, holding a record two days old.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simKinesisStreamFactory.make({}, simAws);
    await simAws.kinesis().increaseStreamRetentionPeriod(
      new IncreaseStreamRetentionPeriodCommand({
        StreamName: "orders",
        RetentionPeriodHours: 168,
      }),
    );
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode("order-1"),
      }),
    );
    await simAws.clock().advanceBy({ hours: 48 });

    // When the retention is shortened back to a day.
    await simAws.kinesis().decreaseStreamRetentionPeriod(
      new DecreaseStreamRetentionPeriodCommand({
        StreamName: "orders",
        RetentionPeriodHours: 24,
      }),
    );

    // Then the record is gone from the next read, since retention is applied
    // when a stream is read rather than when it is changed.
    assertIdentical(await retentionOf(simAws), 24);
    assertArrayLength(await readFromTrimHorizon(simAws), 0);
  });

  it("refuses a change that goes the other way from the command", async () => {
    // Given a stream retaining for the default day.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When an increase asks for no more than the stream already keeps.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.kinesis().increaseStreamRetentionPeriod(
        new IncreaseStreamRetentionPeriodCommand({
          StreamName: "orders",
          RetentionPeriodHours: 24,
        }),
      );
    });

    // Then it is refused, since the caller believed the stream was set to
    // something it was not.
    assertInstanceOf(error, SimKinesisInvalidArgumentException);
    assertStringIncludes(error.message, "Cannot increase the retention");
  });

  it("refuses a decrease asking for no less than the stream keeps", async () => {
    // Given a stream retaining for the default day.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When a decrease asks for more than that.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.kinesis().decreaseStreamRetentionPeriod(
        new DecreaseStreamRetentionPeriodCommand({
          StreamName: "orders",
          RetentionPeriodHours: 48,
        }),
      );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "Cannot decrease the retention");
  });

  it("refuses a retention outside the range Kinesis accepts", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When the retention is set beyond the year Kinesis takes, and below the
    // day it takes.
    for (const hours of [8761, 23]) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await assertThrowsErrorAsync(async () => {
        await simAws.kinesis().increaseStreamRetentionPeriod(
          new IncreaseStreamRetentionPeriodCommand({
            StreamName: "orders",
            RetentionPeriodHours: hours,
          }),
        );
      });
      assertStringIncludes(error.message, "8760 hours Kinesis accepts");
    }
  });

  it("refuses a change that names no retention", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When the retention is changed without saying what to.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .kinesis()
        .increaseStreamRetentionPeriod({ input: { StreamName: "orders" } });
    });

    // Then it is refused.
    assertStringIncludes(error.message, "RetentionPeriodHours is required");
  });
});

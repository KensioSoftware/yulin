import {
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";
import { assertArrayEmpty, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simKinesisStreamFactory } from "./sim-kinesis-stream.factory.js";

const startedAt = new Date("2026-08-22T09:00:00.000Z");

/**
 * Read everything the trim horizon of the stream's only shard still reaches.
 */
async function readFromTrimHorizon(simAws: SimAws): Promise<readonly string[]> {
  const described = await simAws
    .kinesis()
    .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));
  const iterator = await simAws.kinesis().getShardIterator(
    new GetShardIteratorCommand({
      StreamName: "orders",
      ShardId: described.StreamDescription.Shards[0]?.ShardId,
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

/**
 * Put one record onto the stream.
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

describe("Simulated Kinesis retention", () => {
  it("keeps a record for the twenty four hours a new stream retains for", async () => {
    // Given a stream holding one record.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simKinesisStreamFactory.make({}, simAws);
    await putOrder(simAws, "order-1");

    // When simulated time moves on by less than the retention period.
    await simAws.clock().advanceBy({ hours: 23 });

    // Then the record is still there.
    const read = await readFromTrimHorizon(simAws);
    assertIdentical(read.join(","), "order-1");
  });

  it("drops a record the retention window has outlived", async () => {
    // Given a stream holding one record.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simKinesisStreamFactory.make({}, simAws);
    await putOrder(simAws, "order-1");

    // When simulated time moves past the retention period.
    await simAws.clock().advanceBy({ hours: 25 });

    // Then it has gone from a trim horizon read.
    assertArrayEmpty(await readFromTrimHorizon(simAws));
  });

  it("keeps a record put after the ones the window outlived", async () => {
    // Given a stream holding a record put a day before another.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simKinesisStreamFactory.make({}, simAws);
    await putOrder(simAws, "order-1");
    await simAws.clock().advanceBy({ hours: 23 });
    await putOrder(simAws, "order-2");

    // When simulated time moves past the retention of the first alone.
    await simAws.clock().advanceBy({ hours: 2 });

    // Then only the newer record is still readable.
    const read = await readFromTrimHorizon(simAws);
    assertIdentical(read.join(","), "order-2");
  });
});

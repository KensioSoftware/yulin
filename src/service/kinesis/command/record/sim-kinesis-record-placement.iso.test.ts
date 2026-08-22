import {
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simKinesisHashKeySpace } from "../../stream/sim-kinesis-hash-key.js";
import { simKinesisStreamFactory } from "../../stream/sim-kinesis-stream.factory.js";

/**
 * The bytes of one order event.
 */
function orderBytes(id: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ id }));
}

/**
 * Read everything on one shard of a stream, oldest first.
 */
async function readShard(
  simAws: SimAws,
  shardId: string,
): Promise<readonly { PartitionKey: string; Data: Uint8Array }[]> {
  const iterator = await simAws.kinesis().getShardIterator(
    new GetShardIteratorCommand({
      StreamName: "orders",
      ShardId: shardId,
      ShardIteratorType: "TRIM_HORIZON",
    }),
  );
  const read = await simAws
    .kinesis()
    .getRecords(
      new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
    );

  return read.Records;
}

describe("Where a record lands on a simulated Kinesis stream", () => {
  it("reads two records with one partition key back in the order they were put", async () => {
    // Given a stream with two shards.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ shardCount: 2 }, simAws);

    // When two records are put under one partition key.
    const first = await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: orderBytes("order-1"),
      }),
    );
    const second = await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: orderBytes("order-2"),
      }),
    );

    // Then both landed on one shard, and that shard holds them in order.
    assertIdentical(first.ShardId, second.ShardId);

    const records = await readShard(simAws, first.ShardId);
    assertArrayLength(records, 2);
    assertIdentical(
      new TextDecoder().decode(records[0].Data),
      '{"id":"order-1"}',
    );
    assertIdentical(
      new TextDecoder().decode(records[1].Data),
      '{"id":"order-2"}',
    );
  });

  it("spreads records across the shards their partition keys hash onto", async () => {
    // Given a stream with four shards.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ shardCount: 4 }, simAws);

    // When records are put under twenty different partition keys.
    const shardIds = new Set<string>();
    for (let index = 0; index < 20; index += 1) {
      // oxlint-disable-next-line no-await-in-loop
      const placement = await simAws.kinesis().putRecord(
        new PutRecordCommand({
          StreamName: "orders",
          PartitionKey: `customer-${index}`,
          Data: orderBytes(`order-${index}`),
        }),
      );
      shardIds.add(placement.ShardId);
    }

    // Then they did not all land on one shard.
    assertTrue(shardIds.size > 1);
  });

  it("places a record by its explicit hash key rather than its partition key", async () => {
    // Given a stream with two shards, whose second shard owns the upper half of
    // the hash key space.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ shardCount: 2 }, simAws);
    const upperHalf = (simKinesisHashKeySpace / 2n).toString();

    // When a record is put with an explicit hash key in that upper half.
    const placement = await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        ExplicitHashKey: upperHalf,
        Data: orderBytes("order-1"),
      }),
    );

    // Then it landed on the second shard, and it still carries the partition
    // key the producer gave it.
    const described = await simAws
      .kinesis()
      .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));
    assertIdentical(
      placement.ShardId,
      described.StreamDescription.Shards[1]?.ShardId,
    );

    const records = await readShard(simAws, placement.ShardId);
    assertIdentical(records[0]?.PartitionKey, "customer-1");
  });
});

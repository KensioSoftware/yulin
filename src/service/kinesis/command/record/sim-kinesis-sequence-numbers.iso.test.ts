import { PutRecordsCommand } from "@aws-sdk/client-kinesis";
import { assertSetSize, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simKinesisStreamFactory } from "../../stream/sim-kinesis-stream.factory.js";

/**
 * The bytes of one order event.
 */
function orderBytes(id: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ id }));
}

describe("The sequence numbers a simulated Kinesis stream hands out", () => {
  it("gives every record of a batch its own sequence number", async () => {
    // Given a stream with two shards.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ shardCount: 2 }, simAws);

    // When a batch of records is put.
    const put = await simAws.kinesis().putRecords(
      new PutRecordsCommand({
        StreamName: "orders",
        Records: ["a", "b", "c", "d"].map((key) => ({
          PartitionKey: key,
          Data: orderBytes(key),
        })),
      }),
    );

    // Then no two records took the same one. Nothing is claimed about their
    // order against each other, since records on different shards have none.
    const sequenceNumbers = put.Records.map(
      (record) => record.SequenceNumber ?? "",
    );
    assertSetSize(new Set(sequenceNumbers), 4);
  });

  it("increases the sequence number within one shard", async () => {
    // Given a stream with two shards.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ shardCount: 2 }, simAws);

    // When four records are put under one partition key, which is one shard.
    const put = await simAws.kinesis().putRecords(
      new PutRecordsCommand({
        StreamName: "orders",
        Records: ["a", "b", "c", "d"].map((key) => ({
          PartitionKey: "customer-1",
          Data: orderBytes(key),
        })),
      }),
    );

    // Then each record's sequence number is higher than the one before it,
    // which is the ordering Kinesis promises within a shard.
    assertSetSize(new Set(put.Records.map((record) => record.ShardId)), 1);

    const sequenceNumbers = put.Records.map((record) =>
      BigInt(record.SequenceNumber ?? "0"),
    );
    const rising = sequenceNumbers.every(
      (sequenceNumber, index) =>
        index === 0 || sequenceNumber > (sequenceNumbers.at(index - 1) ?? 0n),
    );
    assertTrue(rising);
  });
});

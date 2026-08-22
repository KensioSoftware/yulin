import { PutRecordsCommand } from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertIdentical,
  assertSetSize,
  assertStringStartsWith,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simKinesisStreamFactory } from "../../stream/sim-kinesis-stream.factory.js";

/**
 * The bytes of one order event.
 */
function orderBytes(id: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ id }));
}

describe("Putting a batch of records onto a simulated Kinesis stream", () => {
  it("reports where every record of a batch landed", async () => {
    // Given a stream with two shards.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ shardCount: 2 }, simAws);

    // When three records are put in one batch.
    const put = await simAws.kinesis().putRecords(
      new PutRecordsCommand({
        StreamName: "orders",
        Records: [
          { PartitionKey: "customer-1", Data: orderBytes("order-1") },
          { PartitionKey: "customer-2", Data: orderBytes("order-2") },
          { PartitionKey: "customer-3", Data: orderBytes("order-3") },
        ],
      }),
    );

    // Then each one reports the shard it landed on and the sequence number it
    // took, and nothing failed.
    assertIdentical(put.FailedRecordCount, 0);
    assertArrayLength(put.Records, 3);

    for (const record of put.Records) {
      assertStringStartsWith(record.ShardId ?? "", "shardId-");
      assertTrue((record.SequenceNumber ?? "").length > 0);
      assertUndefined(record.ErrorCode);
    }
  });

  it("gives every record on a stream its own increasing sequence number", async () => {
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

    // Then the sequence numbers are distinct and each is higher than the last.
    const sequenceNumbers = put.Records.map(
      (record) => record.SequenceNumber ?? "",
    );
    assertSetSize(new Set(sequenceNumbers), 4);
    assertIdentical(
      sequenceNumbers.join(","),
      [...sequenceNumbers]
        .toSorted((left, right) => left.localeCompare(right))
        .join(","),
    );
  });
});

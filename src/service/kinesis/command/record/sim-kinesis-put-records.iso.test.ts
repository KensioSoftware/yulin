import { PutRecordsCommand } from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertIdentical,
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
});

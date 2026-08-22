import { DescribeStreamCommand } from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { simKinesisHashKeySpace } from "./sim-kinesis-hash-key.js";
import { simKinesisStreamFactory } from "./sim-kinesis-stream.factory.js";

describe("The shard map of a simulated Kinesis stream", () => {
  it("divides the whole hash key space between the shards with no gap", async () => {
    // Given a stream with three shards, which divides unevenly.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ shardCount: 3 }, simAws);

    // When the stream is described.
    const described = await simAws
      .kinesis()
      .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));

    // Then the shards start at zero, end at the top of the space, and each one
    // picks up where the one before it left off.
    const { Shards } = described.StreamDescription;
    assertArrayLength(Shards, 3);
    assertIdentical(Shards[0].HashKeyRange.StartingHashKey, "0");
    assertIdentical(
      Shards[2].HashKeyRange.EndingHashKey,
      (simKinesisHashKeySpace - 1n).toString(),
    );

    for (const [index, shard] of Shards.slice(1).entries()) {
      const previousEnd = BigInt(
        Shards.at(index)?.HashKeyRange.EndingHashKey ?? "0",
      );
      assertIdentical(
        BigInt(shard.HashKeyRange.StartingHashKey),
        previousEnd + 1n,
      );
    }
  });

  it("numbers the shards the way Kinesis does", async () => {
    // Given a stream with two shards.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ shardCount: 2 }, simAws);

    // When the stream is described.
    const described = await simAws
      .kinesis()
      .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));

    // Then the identifiers are padded ordinals counting from zero.
    const { Shards } = described.StreamDescription;
    assertIdentical(Shards[0]?.ShardId, "shardId-000000000000");
    assertIdentical(Shards[1]?.ShardId, "shardId-000000000001");
  });

  it("leaves an open shard with no ending sequence number", async () => {
    // Given a stream with one shard.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When the stream is described.
    const described = await simAws
      .kinesis()
      .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));

    // Then the shard reports where it started and nothing about where it ends,
    // which is how a reader tells a shard that is still taking records.
    const range = described.StreamDescription.Shards[0]?.SequenceNumberRange;
    assertTrue((range?.StartingSequenceNumber ?? "").length > 0);
    assertUndefined(range?.EndingSequenceNumber);
  });

  it("pages the shards of a stream longer than the limit it was given", async () => {
    // Given a stream with four shards.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ shardCount: 4 }, simAws);

    // When they are described two at a time.
    const first = await simAws
      .kinesis()
      .describeStream(
        new DescribeStreamCommand({ StreamName: "orders", Limit: 2 }),
      );
    const second = await simAws.kinesis().describeStream(
      new DescribeStreamCommand({
        StreamName: "orders",
        ExclusiveStartShardId: first.StreamDescription.Shards[1]?.ShardId,
      }),
    );

    // Then the pages follow each other, and the first one says there are more.
    assertTrue(first.StreamDescription.HasMoreShards);
    assertArrayLength(first.StreamDescription.Shards, 2);
    assertIdentical(
      second.StreamDescription.Shards[0]?.ShardId,
      "shardId-000000000002",
    );
    assertFalse(second.StreamDescription.HasMoreShards);
  });
});

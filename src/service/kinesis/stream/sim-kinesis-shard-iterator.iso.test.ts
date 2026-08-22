import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  readSimKinesisShardIteratorToken,
  simKinesisShardIteratorToken,
} from "./sim-kinesis-shard-iterator.js";
import type { SimKinesisStreamPosition } from "./sim-kinesis-stream-position.js";

const streamArn = "arn:aws:kinesis:eu-west-2:111111111111:stream/orders";

const shardId = "shardId-000000000000";

describe("A simulated Kinesis shard iterator", () => {
  it("carries every position kind there and back", () => {
    // Given the four positions an iterator can stand at.
    const positions: readonly SimKinesisStreamPosition[] = [
      { kind: "start" },
      { kind: "at", sequenceNumber: "100" },
      { kind: "after", sequenceNumber: "200" },
      { kind: "timestamp", epochMillis: 1_756_000_000_000 },
    ];

    // When each one is written into a token and read back out.
    for (const position of positions) {
      const read = readSimKinesisShardIteratorToken(
        simKinesisShardIteratorToken({ streamArn, shardId, position }),
      );

      // Then the place it stands for survives the round trip.
      assertIdentical(read.streamArn, streamArn);
      assertIdentical(read.shardId, shardId);
      assertObjectEquals(read.position, position);
    }
  });
});

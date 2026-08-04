import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimDynamoDbEventSourceStreamShard } from "./sim-dynamodb-event-source-stream-shard.js";
import type { SimLambdaEventSourceStreamCommands } from "./sim-lambda-event-source-stream-service.js";

const streamArn =
  "arn:aws:dynamodb:eu-west-2:111111111111:table/orders/stream/2026-08-04T09:00:00.000";
const request = {
  streamArn,
  caller: { kind: "arn", arn: "arn:aws:iam::111111111111:role/Projector" },
} as const;

/**
 * Streams commands answering with whatever a test needs them to.
 *
 * Simulated DynamoDB never answers with any of this: a stream it resolved by
 * ARN has a table and a shard, and hands out an iterator for it. The port is
 * shaped as the SDK shapes it, where every part of an answer is optional, so
 * these are what the reader does with an answer it cannot read on from.
 */
function commandsAnswering(
  answers: Partial<SimLambdaEventSourceStreamCommands>,
): SimLambdaEventSourceStreamCommands {
  return {
    describeStream: () =>
      Promise.resolve({ StreamDescription: { TableName: "orders" } }),
    getShardIterator: () => Promise.resolve({ ShardIterator: "iterator-1" }),
    getRecords: () =>
      Promise.resolve({ Records: [], NextShardIterator: "iterator-2" }),
    ...answers,
  };
}

describe("sim DynamoDB event source stream shard", () => {
  it("refuses a stream that could not be described", async () => {
    // Given streams answering with no description at all.
    const shard = new SimDynamoDbEventSourceStreamShard(
      commandsAnswering({ describeStream: () => Promise.resolve({}) }),
    );

    // When the table behind the stream is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await shard.tableName(request);
    });

    // Then the mapping is told, rather than polling a stream it knows nothing
    // about.
    assertStringIncludes(error.message, `Stream ${streamArn}`);
    assertStringIncludes(error.message, "could not be described");
  });

  it("refuses a stream that names no table", async () => {
    // Given a stream description with no table on it.
    const shard = new SimDynamoDbEventSourceStreamShard(
      commandsAnswering({
        describeStream: () => Promise.resolve({ StreamDescription: {} }),
      }),
    );

    // When the table behind the stream is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await shard.tableName(request);
    });

    // Then the mapping is told.
    assertStringIncludes(
      error.message,
      "reports no table to poll changes from",
    );
  });

  it("refuses a stream with no shard to read", async () => {
    // Given a stream description carrying no shards.
    const shard = new SimDynamoDbEventSourceStreamShard(
      commandsAnswering({
        describeStream: () =>
          Promise.resolve({
            StreamDescription: { TableName: "orders", Shards: [] },
          }),
      }),
    );

    // When a place to start reading is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await shard.iteratorFor(request, "TRIM_HORIZON");
    });

    // Then the mapping is told.
    assertStringIncludes(
      error.message,
      "reports no shard to read records from",
    );
  });

  it("refuses a stream that hands out no iterator", async () => {
    // Given a stream with a shard, answering with no iterator for it.
    const shard = new SimDynamoDbEventSourceStreamShard(
      commandsAnswering({
        describeStream: () =>
          Promise.resolve({
            StreamDescription: {
              TableName: "orders",
              Shards: [{ ShardId: "shardId-1" }],
            },
          }),
        getShardIterator: () => Promise.resolve({}),
      }),
    );

    // When a place to start reading is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await shard.iteratorFor(request, "LATEST");
    });

    // Then the mapping is told.
    assertStringIncludes(error.message, "gave out no shard iterator");
  });
});

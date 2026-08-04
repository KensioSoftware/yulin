import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  GetRecordsCommand,
  GetShardIteratorCommand,
  type ShardIteratorType,
} from "@aws-sdk/client-dynamodb-streams";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimDynamoDbStream } from "../../../stream/sim-dynamodb-stream.js";
import { simDynamoDbStreamedOrdersFactory } from "../../../stream/sim-dynamodb-streamed-orders.factory.js";

/**
 * The sequence number the record at a position on a fresh stream carries.
 */
function sequenceNumberAt(position: number): string {
  return (100_000_000_000_000_000_000n + BigInt(position)).toString();
}

/**
 * The order identifiers an iterator of a type reads, oldest first, as one
 * string.
 */
async function readFrom(
  simAws: SimAws,
  stream: SimDynamoDbStream,
  iteratorType: ShardIteratorType,
  sequenceNumber?: string,
): Promise<string> {
  const iterator = await simAws.dynamoDbStreams().getShardIterator(
    new GetShardIteratorCommand({
      StreamArn: stream.arn,
      ShardId: stream.shard.shardId,
      ShardIteratorType: iteratorType,
      SequenceNumber: sequenceNumber,
    }),
  );
  const output = await simAws
    .dynamoDbStreams()
    .getRecords(
      new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
    );

  return (output.Records ?? [])
    .map((record) => record.dynamodb?.Keys?.["orderId"]?.S ?? "")
    .join(",");
}

describe("DynamoDB Streams GetShardIterator", () => {
  it("reads from the oldest record with TRIM_HORIZON", async () => {
    // Given a stream with three records on it.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make(
      { orders: 3 },
      simAws,
    );

    // When a TRIM_HORIZON iterator is read from.
    // Then it starts at the first record the stream took.
    assertIdentical(
      await readFrom(simAws, stream, "TRIM_HORIZON"),
      "order-1,order-2,order-3",
    );
  });

  it("skips what is already there with LATEST", async () => {
    // Given a stream with three records on it.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make(
      { orders: 3 },
      simAws,
    );

    // When a LATEST iterator is taken and then another record is written.
    const iterator = await simAws.dynamoDbStreams().getShardIterator(
      new GetShardIteratorCommand({
        StreamArn: stream.arn,
        ShardId: stream.shard.shardId,
        ShardIteratorType: "LATEST",
      }),
    );
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-4" } },
      }),
    );
    const output = await simAws
      .dynamoDbStreams()
      .getRecords(
        new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
      );

    // Then only the record written afterwards is read.
    assertIdentical(
      (output.Records ?? [])
        .map((record) => record.dynamodb?.Keys?.["orderId"]?.S ?? "")
        .join(","),
      "order-4",
    );
  });

  it("includes the record it names with AT_SEQUENCE_NUMBER", async () => {
    // Given a stream with three records on it.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make(
      { orders: 3 },
      simAws,
    );

    // When an iterator is taken at the second record's sequence number.
    // Then the record it names is the first one read.
    assertIdentical(
      await readFrom(simAws, stream, "AT_SEQUENCE_NUMBER", sequenceNumberAt(1)),
      "order-2,order-3",
    );
  });

  it("excludes the record it names with AFTER_SEQUENCE_NUMBER", async () => {
    // Given a stream with three records on it.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make(
      { orders: 3 },
      simAws,
    );

    // When an iterator is taken after the second record's sequence number.
    // Then reading starts at the record following the one it named.
    assertIdentical(
      await readFrom(
        simAws,
        stream,
        "AFTER_SEQUENCE_NUMBER",
        sequenceNumberAt(1),
      ),
      "order-3",
    );
  });
});

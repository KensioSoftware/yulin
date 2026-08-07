import {
  PutItemCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import {
  GetRecordsCommand,
  GetShardIteratorCommand,
} from "@aws-sdk/client-dynamodb-streams";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../../../util/clock/sim-clock.js";
import { assertDefined } from "../../../../../util/type-guard/defined.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimDynamoDbStreamsRecord } from "../stream.types.js";
import { simDynamoDbStreamedTableFactory } from "../../../stream/sim-dynamodb-streamed-table.factory.js";

/**
 * The instant these tests start from, and the epoch seconds of it.
 */
const startedAt = new Date("2026-08-04T09:00:00.000Z");
const startedAtSeconds = String(Math.floor(startedAt.getTime() / 1000));

/**
 * Read everything a streamed table's stream holds, oldest first.
 */
async function recordsOf(
  simAws: SimAws,
): Promise<readonly SimDynamoDbStreamsRecord[]> {
  const table = simAws.dynamoDb().findTable("orders");
  const stream = table?.stream.latest;
  assertDefined(stream, "DynamoDB table stream");

  const iterator = await simAws.dynamoDbStreams().getShardIterator(
    new GetShardIteratorCommand({
      StreamArn: stream.arn,
      ShardId: stream.shard.shardId,
      ShardIteratorType: "TRIM_HORIZON",
    }),
  );
  const output = await simAws
    .dynamoDbStreams()
    .getRecords(
      new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
    );

  return output.Records ?? [];
}

describe("DynamoDB Streams record rendering", () => {
  it("renders a captured change the way the Streams API carries it", async () => {
    // Given a streamed table whose item has been written twice.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simDynamoDbStreamedTableFactory.make({}, simAws);

    for (const total of ["101", "202"]) {
      // oxlint-disable-next-line no-await-in-loop
      await simAws.dynamoDb().putItem(
        new PutItemCommand({
          TableName: "orders",
          Item: { orderId: { S: "order-1" }, total: { N: total } },
        }),
      );
    }

    // When the stream is read.
    const records = await recordsOf(simAws);

    // Then the second record carries both images, under the names and the
    // capitalization the Streams API uses.
    assertArrayLength(records, 2);
    const record = records[1];
    assertIdentical(record.eventName, "MODIFY");
    assertIdentical(record.eventSource, "aws:dynamodb");
    assertIdentical(record.awsRegion, simAws.defaultRegionName);
    assertIdentical(record.eventVersion, "1.1");
    assertIdentical(record.eventID?.length, 32);

    const body = record.dynamodb;
    assertNonNullable(body);
    assertObjectEquals(body.Keys, { orderId: { S: "order-1" } });
    assertObjectEquals(body.NewImage, {
      orderId: { S: "order-1" },
      total: { N: "202" },
    });
    assertObjectEquals(body.OldImage, {
      orderId: { S: "order-1" },
      total: { N: "101" },
    });
    assertIdentical(body.StreamViewType, "NEW_AND_OLD_IMAGES");
    assertIdentical(body.SequenceNumber, "100000000000000000001");

    // And the creation time is a Date, which is what the SDK deserializes a
    // timestamp into, rather than the epoch seconds a Lambda event carries.
    assertInstanceOf(body.ApproximateCreationDateTime, Date);
    assertIdentical(
      body.ApproximateCreationDateTime.toISOString(),
      startedAt.toISOString(),
    );

    // And nothing but DynamoDB itself gets an identity.
    assertUndefined(record.userIdentity);
  });

  it("capitalizes the identity of a time to live removal", async () => {
    // Given a streamed table expiring its items, holding one that is due.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await simDynamoDbStreamedTableFactory.make({}, simAws);
    await simAws.dynamoDb().updateTimeToLive(
      new UpdateTimeToLiveCommand({
        TableName: "orders",
        TimeToLiveSpecification: { Enabled: true, AttributeName: "expiresAt" },
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-1" }, expiresAt: { N: startedAtSeconds } },
      }),
    );

    // When the clock passes the deletion window, far enough that the write
    // itself has aged out of the retention window.
    await simAws.clock().advanceBy({ hours: 49 });

    // Then the removal that is left says DynamoDB made it, under the names the
    // Streams API uses rather than the ones the Lambda event uses.
    const records = await recordsOf(simAws);
    assertArrayLength(records, 1);
    assertIdentical(records[0].eventName, "REMOVE");
    assertObjectEquals(records[0].userIdentity, {
      PrincipalId: "dynamodb.amazonaws.com",
      Type: "Service",
    });
  });
});

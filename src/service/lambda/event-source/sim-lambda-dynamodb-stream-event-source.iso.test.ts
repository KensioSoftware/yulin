import {
  PutItemCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringLength,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithStreamEventSource } from "../../../../test/lambda/stream-event-source-fixture.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";
import type {
  SimLambdaDynamoDbStreamEvent,
  SimLambdaDynamoDbStreamEventRecord,
} from "./poll/sim-lambda-dynamodb-stream-event.js";

/**
 * The orders a batch test writes at once.
 */
const orderIds = ["order-1", "order-2", "order-3", "order-4", "order-5"];

/**
 * The instant the time to live test starts from.
 */
const startedAt = new Date("2026-08-04T09:00:00.000Z");
const startedAtSeconds = String(Math.floor(startedAt.getTime() / 1000));

describe("sim Lambda DynamoDB stream event source mappings", () => {
  it("delivers a written item to the function as a DynamoDB stream event", async () => {
    // Given a table's stream mapped to a function.
    const { simAws, tableName, streamArn, events } =
      await simAwsWithStreamEventSource();

    simAws.clock().freeze();

    // When an item is written to the table.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" }, total: { N: "42" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the handler was given one real-shaped DynamoDB stream record.
    assertArrayLength(events, 1);

    const record = events[0].Records[0];

    assertNonNullable(record);
    assertIdentical(record.eventName, "INSERT");
    assertIdentical(record.eventSource, "aws:dynamodb");
    assertIdentical(record.eventSourceARN, streamArn);
    assertIdentical(record.awsRegion, simAws.defaultRegionName);
    assertIdentical(record.eventVersion, "1.1");
    assertStringLength(record.eventID, 32);
    assertObjectEquals(record.dynamodb.Keys, { orderId: { S: "order-1" } });
    assertObjectEquals(record.dynamodb.NewImage, {
      orderId: { S: "order-1" },
      total: { N: "42" },
    });
    assertIdentical(record.dynamodb.StreamViewType, "NEW_AND_OLD_IMAGES");
    assertIdentical(
      record.dynamodb.ApproximateCreationDateTime,
      Math.floor(simAws.now().getTime() / 1000),
    );
  });

  it("names the parts of a record the way the event does", async () => {
    // Given a table's stream mapped to a function.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource();

    // When an item is written and the record is delivered.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the casing is the event's own rather than a tidy scheme: `eventID`
    // with a capital ID, `dynamodb` with none, `eventSourceARN` with a capital
    // ARN, and the block inside `dynamodb` capitalized.
    const record = events[0]?.Records[0];

    assertNonNullable(record);
    assertArrayEquals(Object.keys(events[0] ?? {}), ["Records"]);
    assertArrayEquals(Object.keys(record), [
      "eventID",
      "eventName",
      "eventVersion",
      "eventSource",
      "awsRegion",
      "dynamodb",
      "eventSourceARN",
    ]);
    assertArrayEquals(Object.keys(record.dynamodb), [
      "ApproximateCreationDateTime",
      "Keys",
      "NewImage",
      "SequenceNumber",
      "SizeBytes",
      "StreamViewType",
    ]);
  });

  it("delivers each of a set of items written at once exactly once", async () => {
    // Given a table's stream mapped to a function.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource();

    // When several items are written at the same time.
    await Promise.all(
      orderIds.map(async (orderId) =>
        simAws.dynamoDb().putItem(
          new PutItemCommand({
            TableName: tableName,
            Item: { orderId: { S: orderId } },
          }),
        ),
      ),
    );
    await simAws.backgroundTasksComplete();

    // Then every change reached the function, and none of them twice.
    const delivered = deliveredOrderIds(events).toSorted((left, right) =>
      left.localeCompare(right),
    );

    assertArrayEquals(delivered, [...orderIds]);
  });

  it("delivers what the stream already holds to a TRIM_HORIZON mapping", async () => {
    // Given a table whose stream already holds a change.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource();

    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When a change is made after the mapping caught up.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-2" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then both are delivered, oldest first.
    assertArrayEquals(deliveredOrderIds(events), ["order-1", "order-2"]);
  });

  it("delivers only what happens next to a LATEST mapping", async () => {
    // Given a mapping created to read only what the table changes from now on.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      startingPosition: "LATEST",
    });

    // When a change the stream already holds is followed by a new one.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" } },
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-2" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then only the one made after the mapping started reading is delivered.
    assertArrayEquals(deliveredOrderIds(events), ["order-2"]);
  });

  it("says DynamoDB made a time to live removal, in the event's own casing", async () => {
    // Given a streamed table expiring its items, mapped to a function.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    const { tableName, events } = await simAwsWithStreamEventSource({ simAws });

    await simAws.dynamoDb().updateTimeToLive(
      new UpdateTimeToLiveCommand({
        TableName: tableName,
        TimeToLiveSpecification: { Enabled: true, AttributeName: "expiresAt" },
      }),
    );
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          orderId: { S: "order-1" },
          expiresAt: { N: startedAtSeconds },
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the clock passes the deletion window.
    await simAws.clock().advanceBy({ days: 3 });

    // Then the removal reached the function with the identity that tells an
    // expiry from a deletion the application asked for, lower-cased the way
    // the event has it rather than the way the Streams API has it.
    const removal = events.at(-1)?.Records[0];

    assertNonNullable(removal);
    assertIdentical(removal.eventName, "REMOVE");
    assertObjectEquals(removal.userIdentity, {
      type: "Service",
      principalId: "dynamodb.amazonaws.com",
    });
  });

  it("reports the starting position a stream mapping was created with", async () => {
    // Given a table's stream mapped to a function.
    const { simAws, uuid } = await simAwsWithStreamEventSource();

    // When the mapping is read back.
    const mapping = await simAws
      .lambda()
      .getEventSourceMapping({ input: { UUID: uuid } });

    // Then it says where it started reading, and with the batch size a
    // DynamoDB stream mapping takes when the request names none.
    assertIdentical(mapping.StartingPosition, "TRIM_HORIZON");
    assertIdentical(mapping.BatchSize, 100);
  });
});

function deliveredOrderIds(
  events: readonly SimLambdaDynamoDbStreamEvent[],
): string[] {
  return events.flatMap((event) =>
    event.Records.map((record) => orderIdOf(record)),
  );
}

function orderIdOf(record: SimLambdaDynamoDbStreamEventRecord): string {
  return record.dynamodb.Keys?.["orderId"]?.S ?? "";
}

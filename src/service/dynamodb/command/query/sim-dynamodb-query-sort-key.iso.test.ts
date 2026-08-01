import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimQueryCommandOutput } from "./query.command.js";

/**
 * A table whose sort key is a string, holding one collection of four items.
 */
async function stringSortKeyTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDbCollectionTableFactory.make(
    {
      tableName: "EventsTable",
      partitionKeyName: "streamId",
      sortKeyName: "eventId",
    },
    simAws,
  );

  await Promise.all(
    ["a-1", "a-2", "b-1", "b-2"].map(async (eventId) =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "EventsTable",
          Item: { streamId: { S: "stream-1" }, eventId: { S: eventId } },
        }),
      ),
    ),
  );

  return simDynamoDb;
}

/**
 * A table whose sort key is a number, holding numbers written several ways.
 */
async function numberSortKeyTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDbCollectionTableFactory.make(
    {
      tableName: "ReadingsTable",
      partitionKeyName: "sensorId",
      sortKeyName: "takenAt",
      sortKeyType: "N",
    },
    simAws,
  );

  await Promise.all(
    ["100", "9", "1E2", "20"].map(async (takenAt) =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "ReadingsTable",
          Item: { sensorId: { S: "sensor-1" }, takenAt: { N: takenAt } },
        }),
      ),
    ),
  );

  return simDynamoDb;
}

/**
 * The sort keys a page came back with, in the order they came back in.
 */
function eventIds(output: SimQueryCommandOutput): readonly string[] {
  return (output.Items ?? []).map((item) => item["eventId"]?.S ?? "");
}

describe("DynamoDB QueryCommand sort key conditions", () => {
  it.each([
    { condition: "eventId = :value", value: "a-2", expected: ["a-2"] },
    { condition: "eventId < :value", value: "a-2", expected: ["a-1"] },
    { condition: "eventId <= :value", value: "a-2", expected: ["a-1", "a-2"] },
    { condition: "eventId > :value", value: "a-2", expected: ["b-1", "b-2"] },
    {
      condition: "eventId >= :value",
      value: "a-2",
      expected: ["a-2", "b-1", "b-2"],
    },
    {
      condition: "begins_with(eventId, :value)",
      value: "b-",
      expected: ["b-1", "b-2"],
    },
  ])("reads the collection with $condition", async (example) => {
    // Given a table holding one stream's events.
    const simAws = new SimAws();
    const simDynamoDb = await stringSortKeyTable(simAws);

    // When the collection is read with a sort key condition.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "EventsTable",
        KeyConditionExpression: `streamId = :stream AND ${example.condition}`,
        ExpressionAttributeValues: {
          ":stream": { S: "stream-1" },
          ":value": { S: example.value },
        },
      }),
    );

    // Then the run of the collection it names comes back, in sort key order.
    assertArrayEquals(eventIds(output), example.expected);
  });

  it("reads the run BETWEEN two bounds, both of them inside", async () => {
    // Given a table holding one stream's events.
    const simAws = new SimAws();
    const simDynamoDb = await stringSortKeyTable(simAws);

    // When the collection is read between two of its sort keys.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "EventsTable",
        KeyConditionExpression:
          "streamId = :stream AND eventId BETWEEN :lower AND :upper",
        ExpressionAttributeValues: {
          ":stream": { S: "stream-1" },
          ":lower": { S: "a-2" },
          ":upper": { S: "b-1" },
        },
      }),
    );

    // Then both bounds are in the run.
    assertArrayEquals(eventIds(output), ["a-2", "b-1"]);
  });

  it("refuses a BETWEEN whose upper bound is below its lower bound", async () => {
    // Given a table holding one stream's events.
    const simAws = new SimAws();
    const simDynamoDb = await stringSortKeyTable(simAws);

    // When the bounds are the wrong way round.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "EventsTable",
          KeyConditionExpression:
            "streamId = :stream AND eventId BETWEEN :lower AND :upper",
          ExpressionAttributeValues: {
            ":stream": { S: "stream-1" },
            ":lower": { S: "b-1" },
            ":upper": { S: "a-2" },
          },
        }),
      ),
    );

    // Then it is refused, since the range names no items at all.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "upper bound at or above");
  });

  it("refuses a BETWEEN whose bounds are not the same type", async () => {
    // Given a table holding one stream's events.
    const simAws = new SimAws();
    const simDynamoDb = await stringSortKeyTable(simAws);

    // When one bound is a string and the other a number.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "EventsTable",
          KeyConditionExpression:
            "streamId = :stream AND eventId BETWEEN :lower AND :upper",
          ExpressionAttributeValues: {
            ":stream": { S: "stream-1" },
            ":lower": { S: "a-1" },
            ":upper": { N: "5" },
          },
        }),
      ),
    );

    // Then it is refused: two types have no order to sit between.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "not the same type");
  });

  it("orders a Number sort key by value rather than by its digits", async () => {
    // Given a table holding readings whose keys are written several ways.
    const simAws = new SimAws();
    const simDynamoDb = await numberSortKeyTable(simAws);

    // When the whole collection is read.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "ReadingsTable",
        KeyConditionExpression: "sensorId = :sensor",
        ExpressionAttributeValues: { ":sensor": { S: "sensor-1" } },
      }),
    );

    // Then the numbers order by value, and `1E2` and `100` were one key rather
    // than two.
    assertArrayEquals(
      (output.Items ?? []).map((item) => item["takenAt"]?.N ?? ""),
      ["9", "20", "100"],
    );
  });

  it("reads a run of a Number sort key by value", async () => {
    // Given a table holding readings.
    const simAws = new SimAws();
    const simDynamoDb = await numberSortKeyTable(simAws);

    // When a run of the collection is read.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "ReadingsTable",
        KeyConditionExpression: "sensorId = :sensor AND takenAt >= :from",
        ExpressionAttributeValues: {
          ":sensor": { S: "sensor-1" },
          ":from": { N: "20" },
        },
      }),
    );

    // Then the comparison is numeric rather than textual: `9` is below `20`.
    assertArrayEquals(
      (output.Items ?? []).map((item) => item["takenAt"]?.N ?? ""),
      ["20", "100"],
    );
  });

  it("refuses begins_with against a Number sort key", async () => {
    // Given a table whose sort key is a number.
    const simAws = new SimAws();
    const simDynamoDb = await numberSortKeyTable(simAws);

    // When a prefix of that sort key is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "ReadingsTable",
          KeyConditionExpression:
            "sensorId = :sensor AND begins_with(takenAt, :prefix)",
          ExpressionAttributeValues: {
            ":sensor": { S: "sensor-1" },
            ":prefix": { N: "1" },
          },
        }),
      ),
    );

    // Then it is refused: a number is stored as a value rather than as the
    // digits it was written with, so it has no prefix.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "String or Binary sort key");
  });

  it("refuses a sort key condition against another type", async () => {
    // Given a table whose sort key is a string.
    const simAws = new SimAws();
    const simDynamoDb = await stringSortKeyTable(simAws);

    // When the sort key is compared against a number.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "EventsTable",
          KeyConditionExpression: "streamId = :stream AND eventId > :value",
          ExpressionAttributeValues: {
            ":stream": { S: "stream-1" },
            ":value": { N: "1" },
          },
        }),
      ),
    );

    // Then it is refused rather than answered with an empty page. A sort key
    // has one type, so the condition could never hold, and an empty page would
    // read as a collection that happens to hold nothing.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "does not match schema type");
    assertStringIncludes(error.message, "eventId");
  });

  it("refuses a partition key compared against another type", async () => {
    // Given a table whose partition key is a string.
    const simAws = new SimAws();
    const simDynamoDb = await stringSortKeyTable(simAws);

    // When the partition key is named by a number.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "EventsTable",
          KeyConditionExpression: "streamId = :stream",
          ExpressionAttributeValues: { ":stream": { N: "1" } },
        }),
      ),
    );

    // Then it is refused too: it names an item collection that cannot exist.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "streamId");
  });

  it("refuses a BETWEEN whose bounds are not the sort key's type", async () => {
    // Given a table whose sort key is a string.
    const simAws = new SimAws();
    const simDynamoDb = await stringSortKeyTable(simAws);

    // When the range is written over numbers, which agree with each other but
    // not with the table.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "EventsTable",
          KeyConditionExpression:
            "streamId = :stream AND eventId BETWEEN :lower AND :upper",
          ExpressionAttributeValues: {
            ":stream": { S: "stream-1" },
            ":lower": { N: "1" },
            ":upper": { N: "9" },
          },
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "does not match schema type");
  });

  it("refuses a begins_with prefix that is not the sort key's type", async () => {
    // Given a table whose sort key is a string.
    const simAws = new SimAws();
    const simDynamoDb = await stringSortKeyTable(simAws);

    // When a binary prefix is asked for against it.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "EventsTable",
          KeyConditionExpression:
            "streamId = :stream AND begins_with(eventId, :prefix)",
          ExpressionAttributeValues: {
            ":stream": { S: "stream-1" },
            ":prefix": { B: new Uint8Array([1, 2]) },
          },
        }),
      ),
    );

    // Then it is refused: a string never begins with binary however the bytes
    // line up.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "does not match schema type");
  });
});

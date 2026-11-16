import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";

/**
 * A table holding one stream of four events.
 */
async function eventsTable(simAws: SimAws): Promise<SimDynamoDb> {
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
 * The values every key condition here uses.
 */
const values = {
  ":stream": { S: "stream-1" },
  ":lower": { S: "a-2" },
  ":upper": { S: "b-1" },
};

describe("DynamoDB QueryCommand bracketed key conditions", () => {
  it.each([
    "(streamId = :stream) AND eventId BETWEEN :lower AND :upper",
    "streamId = :stream AND (eventId BETWEEN :lower AND :upper)",
    "(streamId = :stream AND eventId BETWEEN :lower AND :upper)",
    "((streamId = :stream)) AND (eventId BETWEEN :lower AND :upper)",
  ])(
    "reads %s as it reads the same condition unbracketed",
    async (condition) => {
      // Given a table holding one stream's events.
      const simAws = new SimAws();
      const simDynamoDb = await eventsTable(simAws);

      // When the collection is read with a bracketed key condition.
      const output = await simDynamoDb.query(
        new QueryCommand({
          TableName: "EventsTable",
          KeyConditionExpression: condition,
          ExpressionAttributeValues: values,
        }),
      );

      // Then the brackets change nothing about what is read.
      assertArrayEquals(
        (output.Items ?? []).map((item) => item["eventId"]?.S ?? ""),
        ["a-2", "b-1"],
      );
    },
  );

  it("still refuses a third term hidden in brackets", async () => {
    // Given a table holding one stream's events.
    const simAws = new SimAws();
    const simDynamoDb = await eventsTable(simAws);

    // When a bracketed group tests the sort key a second time.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "EventsTable",
          KeyConditionExpression:
            "streamId = :stream AND (eventId >= :lower AND eventId <= :upper)",
          ExpressionAttributeValues: values,
        }),
      ),
    );

    // Then it is refused as the unbracketed form would be.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "more than once");
  });
});

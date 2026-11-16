import { BatchGetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertArrayLength,
  assertNonNullable,
  assertObjectEquals,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

/**
 * About 390 KB of text, so 42 items carry a response past 16 MB.
 */
const largeText = "x".repeat(390 * 1024);

/**
 * The keys of 50 large orders.
 */
const orderKeys = Array.from({ length: 50 }, (_, index) => ({
  orderId: { S: `order-${index.toString().padStart(2, "0")}` },
}));

/**
 * Put one large order under each of the 50 keys.
 */
async function putLargeOrders(simDynamoDb: SimDynamoDb): Promise<void> {
  for (const key of orderKeys) {
    // oxlint-disable-next-line no-await-in-loop -- one at a time keeps memory down.
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { ...key, notes: { S: largeText } },
      }),
    );
  }
}

describe("DynamoDB BatchGetItemCommand response size", () => {
  it("hands back the keys that would take a response past 16 MB", async () => {
    // Given 50 orders of about 390 KB each.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );
    const simDynamoDb = simAws.dynamoDb();
    await putLargeOrders(simDynamoDb);

    // When one batch asks for all of them.
    const output = await simDynamoDb.batchGetItem(
      new BatchGetItemCommand({
        RequestItems: {
          OrdersTable: { Keys: orderKeys, ConsistentRead: true },
        },
      }),
    );

    // Then the response carries the 42 that fit in 16 MB, and the other 8 come
    // back unprocessed, in the shape they were asked for in.
    assertArrayLength(output.Responses["OrdersTable"] ?? [], 42);

    const unprocessed = output.UnprocessedKeys["OrdersTable"];
    assertNonNullable(unprocessed);
    assertTrue(unprocessed.ConsistentRead);
    assertArrayEquals(
      (unprocessed.Keys ?? []).map((key) => key["orderId"]?.S ?? ""),
      orderKeys.slice(42).map((key) => key.orderId.S),
    );
  });

  it("reads everything when a retry sends the unprocessed keys again", async () => {
    // Given a batch read that left keys unprocessed.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );
    const simDynamoDb = simAws.dynamoDb();
    await putLargeOrders(simDynamoDb);

    const first = await simDynamoDb.batchGetItem(
      new BatchGetItemCommand({
        RequestItems: { OrdersTable: { Keys: orderKeys } },
      }),
    );

    // When the unprocessed keys are sent again.
    // The unprocessed map goes back exactly as it came out, which a plain
    // command shape carries without converting it to the SDK's own types.
    const retry = await simDynamoDb.batchGetItem({
      input: { RequestItems: first.UnprocessedKeys },
    });

    // Then the retry reads the rest and leaves nothing behind.
    assertArrayLength(retry.Responses["OrdersTable"] ?? [], 8);
    assertObjectEquals(retry.UnprocessedKeys, {});
  });

  it("counts what a projection keeps rather than the whole item", async () => {
    // Given 50 orders of about 390 KB each.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );
    const simDynamoDb = simAws.dynamoDb();
    await putLargeOrders(simDynamoDb);

    // When a batch asks for every order's key alone.
    const output = await simDynamoDb.batchGetItem(
      new BatchGetItemCommand({
        RequestItems: {
          OrdersTable: { Keys: orderKeys, ProjectionExpression: "orderId" },
        },
      }),
    );

    // Then all of them fit.
    assertArrayLength(output.Responses["OrdersTable"] ?? [], 50);
    assertUndefined(output.UnprocessedKeys["OrdersTable"]);
  });
});

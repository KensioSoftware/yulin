import { TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * A table with an index keyed on an attribute the table itself is not keyed on.
 *
 * An index is what lets a write be refused for a reason no condition covers, so
 * it is how a transaction is made to fail after its first action would have
 * gone through.
 */
async function indexedTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDb.createTable({
    input: {
      TableName: "FoobarTable",
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: [
        {
          IndexName: "byStatus",
          KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    },
  });
  await simAws.backgroundTasksComplete();

  return simDynamoDb;
}

/**
 * A string of a given number of kilobytes, for pushing an item over 400 KB.
 */
function kilobytes(count: number): string {
  return "x".repeat(count * 1024);
}

describe("DynamoDB transactional write atomicity", () => {
  it("writes nothing when a later action carries a wrong-typed index key", async () => {
    // Given a table with an index whose partition key is a string.
    const simAws = new SimAws();
    const simDynamoDb = await indexedTable(simAws);

    // When the second action of a transaction carries that attribute as a
    // number, which no index could hold.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: "FoobarTable",
                Item: { pk: { S: "order-1" }, title: { S: "A hat" } },
              },
            },
            {
              Put: {
                TableName: "FoobarTable",
                Item: { pk: { S: "order-2" }, status: { N: "1" } },
              },
            },
          ],
        }),
      ),
    );

    // Then the transaction is refused, and the action ahead of the bad one is
    // not written either.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Type mismatch for Index Key status");

    const first = await simDynamoDb.getItem({
      input: { TableName: "FoobarTable", Key: { pk: { S: "order-1" } } },
    });
    assertUndefined(first.Item);
  });

  it("writes nothing when a later action would pass the item size limit", async () => {
    // Given an item already holding 300 KB.
    const simAws = new SimAws();
    const simDynamoDb = await indexedTable(simAws);

    await simDynamoDb.putItem({
      input: {
        TableName: "FoobarTable",
        Item: { pk: { S: "order-2" }, blob: { S: kilobytes(300) } },
      },
    });

    // When the second action of a transaction updates it past 400 KB.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: "FoobarTable",
                Item: { pk: { S: "order-1" }, title: { S: "A hat" } },
              },
            },
            {
              Update: {
                TableName: "FoobarTable",
                Key: { pk: { S: "order-2" } },
                UpdateExpression: "SET extra = :extra",
                ExpressionAttributeValues: { ":extra": { S: kilobytes(200) } },
              },
            },
          ],
        }),
      ),
    );

    // Then the transaction is refused, the first action is not written, and
    // the item the update named is exactly as it was.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Item size has exceeded the maximum allowed size of 409600 bytes",
    );

    const first = await simDynamoDb.getItem({
      input: { TableName: "FoobarTable", Key: { pk: { S: "order-1" } } },
    });
    assertUndefined(first.Item);

    const updated = await simDynamoDb.getItem({
      input: { TableName: "FoobarTable", Key: { pk: { S: "order-2" } } },
    });
    assertUndefined(updated.Item?.["extra"]);
  });

  it("leaves a delete undone when a later action is refused", async () => {
    // Given an item a transaction is going to delete.
    const simAws = new SimAws();
    const simDynamoDb = await indexedTable(simAws);

    await simDynamoDb.putItem({
      input: {
        TableName: "FoobarTable",
        Item: { pk: { S: "order-1" }, title: { S: "A hat" } },
      },
    });

    // When the action after the delete carries a wrong-typed index key.
    await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Delete: {
                TableName: "FoobarTable",
                Key: { pk: { S: "order-1" } },
              },
            },
            {
              Put: {
                TableName: "FoobarTable",
                Item: { pk: { S: "order-2" }, status: { N: "1" } },
              },
            },
          ],
        }),
      ),
    );

    // Then the item is still there.
    const stored = await simDynamoDb.getItem({
      input: { TableName: "FoobarTable", Key: { pk: { S: "order-1" } } },
    });
    assertIdentical(stored.Item?.["title"]?.S, "A hat");
  });

  it("applies every action of a transaction that is not refused", async () => {
    // Given a table with an index, holding an item to delete.
    const simAws = new SimAws();
    const simDynamoDb = await indexedTable(simAws);

    await simDynamoDb.putItem({
      input: {
        TableName: "FoobarTable",
        Item: { pk: { S: "order-1" }, title: { S: "A hat" } },
      },
    });

    // When a transaction deletes it, puts one item and updates another.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Delete: { TableName: "FoobarTable", Key: { pk: { S: "order-1" } } },
          },
          {
            Put: {
              TableName: "FoobarTable",
              Item: { pk: { S: "order-2" }, status: { S: "OPEN" } },
            },
          },
          {
            Update: {
              TableName: "FoobarTable",
              Key: { pk: { S: "order-3" } },
              UpdateExpression: "SET title = :title",
              ExpressionAttributeValues: { ":title": { S: "A coat" } },
            },
          },
        ],
      }),
    );

    // Then all three landed, so staging the writes did not stop any of them
    // being made.
    const deleted = await simDynamoDb.getItem({
      input: { TableName: "FoobarTable", Key: { pk: { S: "order-1" } } },
    });
    assertUndefined(deleted.Item);

    const put = await simDynamoDb.getItem({
      input: { TableName: "FoobarTable", Key: { pk: { S: "order-2" } } },
    });
    assertIdentical(put.Item?.["status"]?.S, "OPEN");

    const updated = await simDynamoDb.getItem({
      input: { TableName: "FoobarTable", Key: { pk: { S: "order-3" } } },
    });
    assertIdentical(updated.Item?.["title"]?.S, "A coat");
  });
});

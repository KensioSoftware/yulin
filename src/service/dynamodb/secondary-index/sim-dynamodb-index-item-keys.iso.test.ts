import { PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDb } from "../sim-dynamodb.js";

/**
 * A table with a partition key of its own and an index keyed on two others.
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
        { AttributeName: "updatedAt", AttributeType: "N" },
      ],
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: [
        {
          IndexName: "byStatus",
          KeySchema: [
            { AttributeName: "status", KeyType: "HASH" },
            { AttributeName: "updatedAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    },
  });
  await simAws.backgroundTasksComplete();

  return simDynamoDb;
}

describe("DynamoDB index key attributes on the write path", () => {
  it("writes an item carrying no index key attribute at all", async () => {
    // Given a table with an index on two attributes.
    const simAws = new SimAws();
    const simDynamoDb = await indexedTable(simAws);

    // When an item is written with neither of them.
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FoobarTable",
        Item: { pk: { S: "order-1" }, title: { S: "A hat" } },
      }),
    );

    // Then the write succeeds. A global secondary index is sparse, so the item
    // is simply absent from it rather than being refused.
    const stored = await simDynamoDb.getItem({
      input: { TableName: "FoobarTable", Key: { pk: { S: "order-1" } } },
    });
    assertIdentical(stored.Item?.["title"]?.S, "A hat");
  });

  it("writes an item carrying part of an index key", async () => {
    // Given a table with an index on two attributes.
    const simAws = new SimAws();
    const simDynamoDb = await indexedTable(simAws);

    // When an item is written with the index partition key and no sort key.
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FoobarTable",
        Item: { pk: { S: "order-1" }, status: { S: "OPEN" } },
      }),
    );

    // Then the write succeeds. The item is absent from the index, since an
    // index entry needs the whole of the index key.
    const stored = await simDynamoDb.getItem({
      input: { TableName: "FoobarTable", Key: { pk: { S: "order-1" } } },
    });
    assertIdentical(stored.Item?.["status"]?.S, "OPEN");
  });

  it("refuses an index key attribute of another type", async () => {
    // Given a table with an index whose sort key is a number.
    const simAws = new SimAws();
    const simDynamoDb = await indexedTable(simAws);

    // When an item is written carrying that attribute as a string.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "FoobarTable",
          Item: {
            pk: { S: "order-1" },
            status: { S: "OPEN" },
            updatedAt: { S: "2026-08-01" },
          },
        }),
      ),
    );

    // Then the write is refused naming the index it could not be held by.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Type mismatch for Index Key updatedAt Expected: N Actual: S " +
        "IndexName: byStatus",
    );
  });

  it("leaves nothing written when an index key type is refused", async () => {
    // Given a table with an index, holding an item already.
    const simAws = new SimAws();
    const simDynamoDb = await indexedTable(simAws);
    await simDynamoDb.putItem({
      input: {
        TableName: "FoobarTable",
        Item: { pk: { S: "order-1" }, title: { S: "A hat" } },
      },
    });

    // When a write replacing it carries an index key of the wrong type.
    await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem({
        input: {
          TableName: "FoobarTable",
          Item: { pk: { S: "order-1" }, status: { N: "1" } },
        },
      }),
    );

    // Then the item is exactly as it was.
    const stored = await simDynamoDb.getItem({
      input: { TableName: "FoobarTable", Key: { pk: { S: "order-1" } } },
    });
    assertIdentical(stored.Item?.["title"]?.S, "A hat");
  });

  it("refuses an update giving an index key attribute another type", async () => {
    // Given a table with an index, holding an item outside it.
    const simAws = new SimAws();
    const simDynamoDb = await indexedTable(simAws);
    await simDynamoDb.putItem({
      input: {
        TableName: "FoobarTable",
        Item: { pk: { S: "order-1" }, title: { S: "A hat" } },
      },
    });

    // When an update sets an index key attribute as the wrong type.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.updateItem(
        new UpdateItemCommand({
          TableName: "FoobarTable",
          Key: { pk: { S: "order-1" } },
          UpdateExpression: "SET #status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": { N: "1" } },
        }),
      ),
    );

    // Then it is refused too. Every write reaches the table the same way, so
    // the check needs writing once.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Type mismatch for Index Key status");
  });
});

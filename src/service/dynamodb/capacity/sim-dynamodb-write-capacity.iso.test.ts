import {
  BatchWriteItemCommand,
  DeleteItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { simDynamoDbIndexedTableFactory } from "../secondary-index/sim-dynamodb-indexed-table.factory.js";
import { simDynamoDbCreatedTableFactory } from "../table/sim-dynamodb-created-table.factory.js";

/**
 * Text that takes an item just past 1.5 KB.
 */
const notes = "x".repeat(1500);

describe("DynamoDB write ConsumedCapacity", () => {
  it("charges a put by the item size rounded up to the next 1 KB", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When an item of about 1.5 KB is put, asking for the total.
    const output = await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: "order-1" }, notes: { S: notes } },
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    // Then it consumed two write units.
    assertObjectEquals(output.ConsumedCapacity, {
      TableName: "OrdersTable",
      CapacityUnits: 2,
      WriteCapacityUnits: 2,
    });
  });

  it("charges a put over a larger item for the larger of the two", async () => {
    // Given a table holding a 1.5 KB order.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: "order-1" }, notes: { S: notes } },
      }),
    );

    // When a small item replaces it.
    const output = await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: "order-1" } },
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    // Then it is charged for the item it replaced.
    assertIdentical(output.ConsumedCapacity?.CapacityUnits, 2);
  });

  it("charges a delete of an absent key one unit", async () => {
    // Given an empty table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When a key that holds nothing is deleted.
    const output = await simAws.dynamoDb().deleteItem(
      new DeleteItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    // Then it still consumed a write unit.
    assertIdentical(output.ConsumedCapacity?.WriteCapacityUnits, 1);
  });

  it("charges an index entry that appears, and two for a moved one", async () => {
    // Given a table whose global index is keyed by status and ship date.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make(
      { projectionType: "KEYS_ONLY", orderCount: 0 },
      simAws,
    );
    const dynamoDb = simAws.dynamoDb();

    // When an order carrying both index keys is put, and then its status
    // changes.
    const put = await dynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: {
          orderId: { S: "order-1" },
          status: { S: "open" },
          shippedAt: { S: "2026-01" },
        },
        ReturnConsumedCapacity: "INDEXES",
      }),
    );
    const moved = await dynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "SET #status = :closed",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":closed": { S: "closed" } },
        ReturnConsumedCapacity: "INDEXES",
      }),
    );

    // Then the put wrote one index entry, and the move deleted one and put
    // another.
    assertObjectEquals(put.ConsumedCapacity, {
      TableName: "OrdersTable",
      CapacityUnits: 2,
      WriteCapacityUnits: 2,
      Table: { CapacityUnits: 1, WriteCapacityUnits: 1 },
      GlobalSecondaryIndexes: {
        byStatus: { CapacityUnits: 1, WriteCapacityUnits: 1 },
      },
    });
    assertIdentical(
      moved.ConsumedCapacity?.GlobalSecondaryIndexes?.["byStatus"]
        ?.WriteCapacityUnits,
      2,
    );
  });

  it("leaves out an index a write does not change", async () => {
    // Given an order in a table whose index projects only keys.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make(
      { projectionType: "KEYS_ONLY", orderCount: 0 },
      simAws,
    );
    const dynamoDb = simAws.dynamoDb();
    await dynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: {
          orderId: { S: "order-1" },
          status: { S: "open" },
          shippedAt: { S: "2026-01" },
        },
      }),
    );

    // When an attribute the index does not project changes.
    const output = await dynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "SET title = :title",
        ExpressionAttributeValues: { ":title": { S: "Renamed" } },
        ReturnConsumedCapacity: "INDEXES",
      }),
    );

    // Then only the table is charged.
    assertUndefined(output.ConsumedCapacity?.GlobalSecondaryIndexes);
  });

  it("charges a transactional write twice", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When a transaction puts a small item.
    const output = await simAws.dynamoDb().transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: "OrdersTable",
              Item: { orderId: { S: "order-1" } },
            },
          },
        ],
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    // Then it consumed two write units, reported for the table.
    assertObjectEquals(output.ConsumedCapacity, [
      { TableName: "OrdersTable", CapacityUnits: 2, WriteCapacityUnits: 2 },
    ]);
  });

  it("rounds each item of a batch write before adding them up", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When a batch puts a small item and a 1.5 KB one.
    const output = await simAws.dynamoDb().batchWriteItem(
      new BatchWriteItemCommand({
        RequestItems: {
          OrdersTable: [
            { PutRequest: { Item: { orderId: { S: "order-1" } } } },
            {
              PutRequest: {
                Item: { orderId: { S: "order-2" }, notes: { S: notes } },
              },
            },
          ],
        },
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    // Then the two cost one unit and two.
    const [consumed] = output.ConsumedCapacity ?? [];
    assertNonNullable(consumed);
    assertIdentical(consumed.CapacityUnits, 3);
  });

  it("refuses a ReturnConsumedCapacity AWS does not have", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When a put asks for a level of report AWS has no name for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().putItem({
        input: {
          TableName: "OrdersTable",
          Item: { orderId: { S: "order-1" } },
          ReturnConsumedCapacity: "ALL",
        },
      }),
    );

    // Then it is refused in AWS's words, and nothing is written.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Member must satisfy enum value set: [INDEXES, TOTAL, NONE]",
    );
  });
});

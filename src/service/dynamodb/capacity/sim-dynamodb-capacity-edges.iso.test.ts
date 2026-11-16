import {
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { simDynamoDbIndexedTableFactory } from "../secondary-index/sim-dynamodb-indexed-table.factory.js";
import { simDynamoDbLocallyIndexedTableFactory } from "../secondary-index/sim-dynamodb-locally-indexed-table.factory.js";
import { simDynamoDbCreatedTableFactory } from "../table/sim-dynamodb-created-table.factory.js";

describe("DynamoDB ConsumedCapacity edge cases", () => {
  it("charges an update while a new index is still being built", async () => {
    // Given an order, and an index on its status that is still being built.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );
    const dynamoDb = simAws.dynamoDb();
    await dynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: "order-1" }, status: { S: "open" } },
      }),
    );
    await dynamoDb.updateTable(
      new UpdateTableCommand({
        TableName: "OrdersTable",
        AttributeDefinitions: [{ AttributeName: "status", AttributeType: "S" }],
        GlobalSecondaryIndexUpdates: [
          {
            Create: {
              IndexName: "byStatus",
              KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
              Projection: { ProjectionType: "KEYS_ONLY" },
            },
          },
        ],
      }),
    );

    // When the order's status changes, asking for the breakdown.
    const output = await dynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "SET #status = :closed",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":closed": { S: "closed" } },
        ReturnConsumedCapacity: "INDEXES",
      }),
    );

    // Then the index being built is charged for the entry that moved.
    assertIdentical(
      output.ConsumedCapacity?.GlobalSecondaryIndexes?.["byStatus"]
        ?.WriteCapacityUnits,
      2,
    );
  });

  it("charges a local index read's fetches to the table, one by one", async () => {
    // Given two small orders for one customer, in a table whose local index
    // projects only keys.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make(
      { projectionType: "KEYS_ONLY" },
      simAws,
    );
    const dynamoDb = simAws.dynamoDb();
    for (const orderId of ["order-x1", "order-x2"]) {
      // oxlint-disable-next-line no-await-in-loop -- two puts, in order.
      await dynamoDb.putItem(
        new PutItemCommand({
          TableName: "OrdersTable",
          Item: {
            customerId: { S: "customer-x" },
            orderId: { S: orderId },
            placedAt: { S: "2026-04" },
            title: { S: "An order" },
          },
        }),
      );
    }

    // When the index is read for whole items, strongly consistently.
    const output = await dynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        IndexName: "byPlacedAt",
        KeyConditionExpression: "customerId = :customer",
        ExpressionAttributeValues: { ":customer": { S: "customer-x" } },
        Select: "ALL_ATTRIBUTES",
        ConsistentRead: true,
        ReturnConsumedCapacity: "INDEXES",
      }),
    );

    // Then the index entries cost one unit together, and each fetch from the
    // table costs one of its own.
    assertObjectEquals(output.ConsumedCapacity, {
      TableName: "OrdersTable",
      CapacityUnits: 3,
      ReadCapacityUnits: 3,
      Table: { CapacityUnits: 2, ReadCapacityUnits: 2 },
      LocalSecondaryIndexes: {
        byPlacedAt: { CapacityUnits: 1, ReadCapacityUnits: 1 },
      },
    });
  });

  it("reads a map written in another order as the same index entry", async () => {
    // Given an order carrying a map, in a table whose index projects it.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({ orderCount: 0 }, simAws);
    const dynamoDb = simAws.dynamoDb();
    const order = {
      orderId: { S: "order-1" },
      status: { S: "open" },
      shippedAt: { S: "2026-01" },
    };
    await dynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: {
          ...order,
          address: { M: { city: { S: "a" }, zip: { S: "b" } } },
        },
      }),
    );

    // When the same order is put with the map's members the other way round.
    const output = await dynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: {
          ...order,
          address: { M: { zip: { S: "b" }, city: { S: "a" } } },
        },
        ReturnConsumedCapacity: "INDEXES",
      }),
    );

    // Then the index entry is unchanged and the index is not charged.
    assertUndefined(output.ConsumedCapacity?.GlobalSecondaryIndexes);
  });

  it("reports no collection for a transaction's condition check", async () => {
    // Given a table with a local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When a transaction only checks a condition on an order.
    const output = await simAws.dynamoDb().transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: "OrdersTable",
              Key: {
                customerId: { S: "customer-1" },
                orderId: { S: "order-01" },
              },
              ConditionExpression: "attribute_exists(orderId)",
            },
          },
        ],
        ReturnItemCollectionMetrics: "SIZE",
      }),
    );

    // Then nothing was written, so no collection is reported.
    assertUndefined(output.ItemCollectionMetrics);
  });

  it("charges a replayed transaction for reading its items", async () => {
    // Given a transaction that has already put a small order.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );
    const transaction = new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: "OrdersTable",
            Item: { orderId: { S: "order-1" } },
          },
        },
      ],
      ClientRequestToken: "token-1",
      ReturnConsumedCapacity: "TOTAL",
    });
    await simAws.dynamoDb().transactWriteItems(transaction);

    // When the same request is sent again.
    const replay = await simAws.dynamoDb().transactWriteItems(transaction);

    // Then it is charged two read units for the item, and no writes.
    assertObjectEquals(replay.ConsumedCapacity, [
      { TableName: "OrdersTable", CapacityUnits: 2, ReadCapacityUnits: 2 },
    ]);
  });
});

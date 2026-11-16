import {
  BatchGetItemCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  TransactGetItemsCommand,
} from "@aws-sdk/client-dynamodb";
import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { simDynamoDbIndexedTableFactory } from "../secondary-index/sim-dynamodb-indexed-table.factory.js";
import { simDynamoDbCreatedTableFactory } from "../table/sim-dynamodb-created-table.factory.js";

/**
 * A table holding one order of about 10 KB and one of about 1.5 KB.
 */
async function ordersTable(simAws: SimAws): Promise<void> {
  await simDynamoDbCreatedTableFactory.make(
    { tableName: "OrdersTable", partitionKeyName: "orderId" },
    simAws,
  );

  for (const [orderId, size] of [
    ["large", 10 * 1024],
    ["small", 1500],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- two puts, in order.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: orderId }, notes: { S: "x".repeat(size) } },
      }),
    );
  }
}

describe("DynamoDB read ConsumedCapacity", () => {
  it("charges a strongly consistent read a unit per 4 KB", async () => {
    // Given a table holding a 10 KB order.
    const simAws = new SimAws();
    await ordersTable(simAws);

    // When it is read with a strongly consistent read, and then an eventually
    // consistent one.
    const strong = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "large" } },
        ConsistentRead: true,
        ReturnConsumedCapacity: "TOTAL",
      }),
    );
    const eventual = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "large" } },
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    // Then 12 KB was charged at one unit per 4 KB, and half that.
    assertObjectEquals(strong.ConsumedCapacity, {
      TableName: "OrdersTable",
      CapacityUnits: 3,
      ReadCapacityUnits: 3,
    });
    assertIdentical(eventual.ConsumedCapacity?.CapacityUnits, 1.5);
  });

  it("charges a read of an absent key the first 4 KB", async () => {
    // Given a table.
    const simAws = new SimAws();
    await ordersTable(simAws);

    // When a key that holds nothing is read.
    const output = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "absent" } },
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    // Then half a unit was consumed.
    assertIdentical(output.ConsumedCapacity?.CapacityUnits, 0.5);
  });

  it("adds a scan's items up before rounding, filter or not", async () => {
    // Given a table holding about 11.5 KB of orders.
    const simAws = new SimAws();
    await ordersTable(simAws);

    // When a scan filters out every order.
    const output = await simAws.dynamoDb().scan(
      new ScanCommand({
        TableName: "OrdersTable",
        FilterExpression: "orderId = :none",
        ExpressionAttributeValues: { ":none": { S: "none" } },
        ConsistentRead: true,
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    // Then it is charged for the 12 KB it read.
    assertIdentical(output.Count, 0);
    assertIdentical(output.ConsumedCapacity?.CapacityUnits, 3);
  });

  it("rounds each item of a batch read before adding them up", async () => {
    // Given a table holding a 10 KB order and a 1.5 KB one.
    const simAws = new SimAws();
    await ordersTable(simAws);

    // When a batch reads both strongly consistently.
    const output = await simAws.dynamoDb().batchGetItem(
      new BatchGetItemCommand({
        RequestItems: {
          OrdersTable: {
            Keys: [{ orderId: { S: "large" } }, { orderId: { S: "small" } }],
            ConsistentRead: true,
          },
        },
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    // Then the two cost three units and one.
    assertObjectEquals(output.ConsumedCapacity, [
      { TableName: "OrdersTable", CapacityUnits: 4, ReadCapacityUnits: 4 },
    ]);
  });

  it("charges a transactional read two units per 4 KB", async () => {
    // Given a table holding a 1.5 KB order.
    const simAws = new SimAws();
    await ordersTable(simAws);

    // When a transaction reads it.
    const output = await simAws.dynamoDb().transactGetItems(
      new TransactGetItemsCommand({
        TransactItems: [
          {
            Get: { TableName: "OrdersTable", Key: { orderId: { S: "small" } } },
          },
        ],
        ReturnConsumedCapacity: "TOTAL",
      }),
    );

    // Then it consumed two read units.
    assertIdentical(output.ConsumedCapacity?.[0]?.CapacityUnits, 2);
  });

  it("charges a query of a global index to the index", async () => {
    // Given a table whose global index holds several orders.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When the index is queried, asking for the breakdown.
    const output = await simAws.dynamoDb().query(
      new QueryCommand({
        TableName: "OrdersTable",
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":open": { S: "open" } },
        ReturnConsumedCapacity: "INDEXES",
      }),
    );

    // Then the index carries the charge, and the table none.
    assertObjectEquals(output.ConsumedCapacity, {
      TableName: "OrdersTable",
      CapacityUnits: 0.5,
      ReadCapacityUnits: 0.5,
      Table: { CapacityUnits: 0 },
      GlobalSecondaryIndexes: {
        byStatus: { CapacityUnits: 0.5, ReadCapacityUnits: 0.5 },
      },
    });
  });
});

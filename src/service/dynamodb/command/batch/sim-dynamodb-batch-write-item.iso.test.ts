import {
  BatchWriteItemCommand,
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

describe("DynamoDB BatchWriteItemCommand", () => {
  it("writes items to two tables in one call", async () => {
    // Given two tables.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "OrdersTable",
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "CustomersTable",
        KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "customerId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    // When one batch writes to both of them.
    const output = await simDynamoDb.batchWriteItem(
      new BatchWriteItemCommand({
        RequestItems: {
          OrdersTable: [
            { PutRequest: { Item: { orderId: { S: "order-1" } } } },
            { PutRequest: { Item: { orderId: { S: "order-2" } } } },
          ],
          CustomersTable: [
            { PutRequest: { Item: { customerId: { S: "customer-1" } } } },
          ],
        },
      }),
    );

    // Then every item is there, and nothing was left unprocessed.
    assertObjectEquals(output.UnprocessedItems, {});

    const order = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-2" } },
      }),
    );
    assertIdentical(order.Item?.["orderId"]?.S, "order-2");

    const customer = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "CustomersTable",
        Key: { customerId: { S: "customer-1" } },
      }),
    );
    assertIdentical(customer.Item?.["customerId"]?.S, "customer-1");
  });

  it("replaces the whole item a put lands on", async () => {
    // Given a table holding an item with two attributes.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "OrdersTable",
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: {
          orderId: { S: "order-1" },
          total: { N: "19.99" },
          note: { S: "first" },
        },
      }),
    );

    // When a batch put writes the same key with one attribute.
    await simDynamoDb.batchWriteItem(
      new BatchWriteItemCommand({
        RequestItems: {
          OrdersTable: [
            {
              PutRequest: {
                Item: { orderId: { S: "order-1" }, total: { N: "24.99" } },
              },
            },
          ],
        },
      }),
    );

    // Then the item was replaced rather than merged into, as PutItem replaces
    // it.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    const item = output.Item;
    assertNonNullable(item);
    assertIdentical(item["total"]?.N, "24.99");
    assertUndefined(item["note"]);
  });

  it("puts and deletes different items of one table in one call", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "OrdersTable",
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: "order-1" } },
      }),
    );

    // When a batch writes one item and deletes another.
    await simDynamoDb.batchWriteItem(
      new BatchWriteItemCommand({
        RequestItems: {
          OrdersTable: [
            { PutRequest: { Item: { orderId: { S: "order-2" } } } },
            { DeleteRequest: { Key: { orderId: { S: "order-1" } } } },
          ],
        },
      }),
    );

    // Then both landed.
    const written = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-2" } },
      }),
    );
    assertIdentical(written.Item?.["orderId"]?.S, "order-2");

    const deleted = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertUndefined(deleted.Item);
  });

  it("deletes a key that holds nothing", async () => {
    // Given a table holding no items.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "OrdersTable",
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    // When a batch deletes a key nothing was ever written under.
    const output = await simDynamoDb.batchWriteItem(
      new BatchWriteItemCommand({
        RequestItems: {
          OrdersTable: [
            { DeleteRequest: { Key: { orderId: { S: "order-1" } } } },
          ],
        },
      }),
    );

    // Then it succeeds, as a delete names a key rather than an item.
    assertObjectEquals(output.UnprocessedItems, {});
  });

  it("writes to a table named by its ARN", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const creation = await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "OrdersTable",
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    const tableArn = creation.TableDescription?.TableArn;
    assertNonNullable(tableArn);

    // When a batch names the table by its ARN.
    await simDynamoDb.batchWriteItem(
      new BatchWriteItemCommand({
        RequestItems: {
          [tableArn]: [{ PutRequest: { Item: { orderId: { S: "order-1" } } } }],
        },
      }),
    );

    // Then it is the same table.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertIdentical(output.Item?.["orderId"]?.S, "order-1");
  });

  it("takes the 25 requests a batch write holds", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "OrdersTable",
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    // When a batch writes exactly 25 items.
    await simDynamoDb.batchWriteItem(
      new BatchWriteItemCommand({
        RequestItems: {
          OrdersTable: Array.from({ length: 25 }, (_unused, index) => ({
            PutRequest: { Item: { orderId: { S: `order-${String(index)}` } } },
          })),
        },
      }),
    );

    // Then all of them are there.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-24" } },
      }),
    );
    assertIdentical(output.Item?.["orderId"]?.S, "order-24");
  });
});

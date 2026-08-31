import {
  BatchGetItemCommand,
  CreateTableCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

describe("DynamoDB BatchGetItemCommand", () => {
  it("reads items from two tables in one call", async () => {
    // Given two tables, each holding an item.
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

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: "order-1" }, total: { N: "19.99" } },
      }),
    );
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "CustomersTable",
        Item: { customerId: { S: "customer-1" }, name: { S: "Ada" } },
      }),
    );

    // When one batch reads from both of them.
    const output = await simDynamoDb.batchGetItem(
      new BatchGetItemCommand({
        RequestItems: {
          OrdersTable: { Keys: [{ orderId: { S: "order-1" } }] },
          CustomersTable: { Keys: [{ customerId: { S: "customer-1" } }] },
        },
      }),
    );

    // Then each table answers under the name it was asked by, and no key was
    // left unread.
    assertIdentical(
      output.Responses["OrdersTable"]?.[0]?.["total"]?.N,
      "19.99",
    );
    assertIdentical(
      output.Responses["CustomersTable"]?.[0]?.["name"]?.S,
      "Ada",
    );
    assertObjectEquals(output.UnprocessedKeys, {});
  });

  it("leaves out a key that holds nothing", async () => {
    // Given a table holding one of the two items a read asks for.
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

    // When a batch reads both keys.
    const output = await simDynamoDb.batchGetItem(
      new BatchGetItemCommand({
        RequestItems: {
          OrdersTable: {
            Keys: [
              { orderId: { S: "order-1" } },
              { orderId: { S: "order-2" } },
            ],
          },
        },
      }),
    );

    // Then only the item that was there comes back, with nothing standing in
    // for the one that was not.
    const items = output.Responses["OrdersTable"];
    assertNonNullable(items);
    assertArrayLength(items, 1);
    assertIdentical(items[0]["orderId"]?.S, "order-1");
  });

  it("answers with an empty list for a table holding none of the keys", async () => {
    // Given a table holding nothing.
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

    // When a batch reads a key from it.
    const output = await simDynamoDb.batchGetItem(
      new BatchGetItemCommand({
        RequestItems: {
          OrdersTable: { Keys: [{ orderId: { S: "order-1" } }] },
        },
      }),
    );

    // Then the table is still in the answer, holding nothing.
    const items = output.Responses["OrdersTable"];
    assertNonNullable(items);
    assertArrayEmpty(items);
  });

  it("projects each table by its own ProjectionExpression", async () => {
    // Given two tables, each holding an item with several attributes.
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

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: {
          orderId: { S: "order-1" },
          total: { N: "19.99" },
          note: { S: "gift" },
        },
      }),
    );
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "CustomersTable",
        Item: {
          customerId: { S: "customer-1" },
          name: { S: "Ada" },
          address: { M: { city: { S: "London" } } },
        },
      }),
    );

    // When one batch asks each table for a different part of its items.
    const output = await simDynamoDb.batchGetItem(
      new BatchGetItemCommand({
        RequestItems: {
          OrdersTable: {
            Keys: [{ orderId: { S: "order-1" } }],
            ProjectionExpression: "#t",
            ExpressionAttributeNames: { "#t": "total" },
          },
          CustomersTable: {
            Keys: [{ customerId: { S: "customer-1" } }],
            ProjectionExpression: "address.city",
          },
        },
      }),
    );

    // Then each table answers with what it was asked for, and nothing else.
    const order = output.Responses["OrdersTable"]?.[0];
    assertNonNullable(order);
    assertArrayEquals(Object.keys(order), ["total"]);

    const customer = output.Responses["CustomersTable"]?.[0];
    assertNonNullable(customer);
    assertIdentical(customer["address"]?.M?.["city"]?.S, "London");
    assertUndefined(customer["name"]);
  });

  it("sets ConsistentRead per table", async () => {
    // Given two tables, each holding an item.
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

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: "order-1" } },
      }),
    );
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "CustomersTable",
        Item: { customerId: { S: "customer-1" } },
      }),
    );

    // When one batch reads one table consistently and the other not.
    const output = await simDynamoDb.batchGetItem(
      new BatchGetItemCommand({
        RequestItems: {
          OrdersTable: {
            Keys: [{ orderId: { S: "order-1" } }],
            ConsistentRead: true,
          },
          CustomersTable: {
            Keys: [{ customerId: { S: "customer-1" } }],
            ConsistentRead: false,
          },
        },
      }),
    );

    // Then both answer with the latest write: this simulation is always
    // strongly consistent.
    assertIdentical(
      output.Responses["OrdersTable"]?.[0]?.["orderId"]?.S,
      "order-1",
    );
    assertIdentical(
      output.Responses["CustomersTable"]?.[0]?.["customerId"]?.S,
      "customer-1",
    );
  });

  it("reads from a table named by its ARN", async () => {
    // Given a table holding an item.
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

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: "order-1" } },
      }),
    );

    // When a batch names the table by its ARN.
    const output = await simDynamoDb.batchGetItem(
      new BatchGetItemCommand({
        RequestItems: { [tableArn]: { Keys: [{ orderId: { S: "order-1" } }] } },
      }),
    );

    // Then the items come back under the ARN the request asked with.
    assertArrayEquals(Object.keys(output.Responses), [tableArn]);

    const items = Object.values(output.Responses)[0];
    assertNonNullable(items);
    assertIdentical(items[0]?.["orderId"]?.S, "order-1");
  });
});

import {
  BatchWriteItemCommand,
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";

describe("DynamoDB BatchWriteItemCommand whole batch refusals", () => {
  it("refuses more than 25 requests, counted across tables", async () => {
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

    // When a batch carries 26 requests split between them.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({
          RequestItems: {
            OrdersTable: Array.from({ length: 13 }, (_unused, index) => ({
              PutRequest: {
                Item: { orderId: { S: `order-${String(index)}` } },
              },
            })),
            CustomersTable: Array.from({ length: 13 }, (_unused, index) => ({
              PutRequest: {
                Item: { customerId: { S: `customer-${String(index)}` } },
              },
            })),
          },
        }),
      ),
    );

    // Then the whole batch is refused, and nothing was written.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Too many items requested for the BatchWriteItem call",
    );

    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-0" } },
      }),
    );
    assertUndefined(output.Item);
  });

  it("refuses two operations on the same item", async () => {
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
        Item: { orderId: { S: "order-1" }, note: { S: "first" } },
      }),
    );

    // When one batch puts and deletes the same key, alongside a write that
    // would otherwise have gone through.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({
          RequestItems: {
            OrdersTable: [
              { PutRequest: { Item: { orderId: { S: "order-2" } } } },
              {
                PutRequest: {
                  Item: { orderId: { S: "order-1" }, note: { S: "second" } },
                },
              },
              { DeleteRequest: { Key: { orderId: { S: "order-1" } } } },
            ],
          },
        }),
      ),
    );

    // Then the whole batch is refused, and neither write was applied.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Provided list of item keys contains duplicates",
    );

    const untouched = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertIdentical(untouched.Item?.["note"]?.S, "first");

    const unwritten = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-2" } },
      }),
    );
    assertUndefined(unwritten.Item);
  });

  it("takes the same key in two different tables", async () => {
    // Given two tables whose keys are named the same way.
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
        TableName: "ArchivedOrdersTable",
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    // When one batch writes the same key to both.
    await simDynamoDb.batchWriteItem(
      new BatchWriteItemCommand({
        RequestItems: {
          OrdersTable: [
            { PutRequest: { Item: { orderId: { S: "order-1" } } } },
          ],
          ArchivedOrdersTable: [
            { PutRequest: { Item: { orderId: { S: "order-1" } } } },
          ],
        },
      }),
    );

    // Then both went through: two operations on one item are two operations on
    // one item of one table.
    const order = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertIdentical(order.Item?.["orderId"]?.S, "order-1");

    const archived = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "ArchivedOrdersTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertIdentical(archived.Item?.["orderId"]?.S, "order-1");
  });

  it("refuses a batch naming a table that is not there", async () => {
    // Given one table.
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

    // When a batch writes to it and to a table that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({
          RequestItems: {
            OrdersTable: [
              { PutRequest: { Item: { orderId: { S: "order-1" } } } },
            ],
            MissingTable: [
              { PutRequest: { Item: { orderId: { S: "order-1" } } } },
            ],
          },
        }),
      ),
    );

    // Then the whole batch is refused, including the part that named a table
    // that is there.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);

    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertUndefined(output.Item);
  });

  it("refuses a key that does not match the table's key schema", async () => {
    // Given a table keyed by a string.
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

    // When a batch puts one item keyed by a number, after one that is fine.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({
          RequestItems: {
            OrdersTable: [
              { PutRequest: { Item: { orderId: { S: "order-1" } } } },
              { PutRequest: { Item: { orderId: { N: "2" } } } },
            ],
          },
        }),
      ),
    );

    // Then the whole batch is refused, and the item that was fine is not there
    // either.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Type mismatch for key attribute");

    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertUndefined(output.Item);
  });

  it("refuses an item over the 400 KB an item holds", async () => {
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

    // When a batch carries an item bigger than that.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({
          RequestItems: {
            OrdersTable: [
              { PutRequest: { Item: { orderId: { S: "order-1" } } } },
              {
                PutRequest: {
                  Item: {
                    orderId: { S: "order-2" },
                    padding: { S: "x".repeat(400 * 1024) },
                  },
                },
              },
            ],
          },
        }),
      ),
    );

    // Then the whole batch is refused, and the item that fits is not written.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Item size has exceeded the maximum");

    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertUndefined(output.Item);
  });
});

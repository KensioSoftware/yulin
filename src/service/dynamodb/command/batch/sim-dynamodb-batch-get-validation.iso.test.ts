import {
  BatchGetItemCommand,
  CreateTableCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";

const ordersTable = new CreateTableCommand({
  TableName: "OrdersTable",
  KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
  AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
  BillingMode: "PAY_PER_REQUEST",
});

describe("DynamoDB BatchGetItemCommand request validation", () => {
  it("requires RequestItems naming a table", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch names no table at all.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem(new BatchGetItemCommand({ RequestItems: {} })),
    );

    // Then it is refused, since a batch has to read something.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "BatchGetItem requires RequestItems naming at least one table",
    );
  });

  it("requires RequestItems at all", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch carries no RequestItems.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem({ input: {} }),
    );

    // Then it is refused the same way an empty one is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "BatchGetItem requires RequestItems naming at least one table",
    );
  });

  it("refuses a table named with no Keys at all", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch names it without saying what to read.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem({
        input: { RequestItems: { OrdersTable: {} } },
      }),
    );

    // Then it is refused the same way an empty list of keys is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "names the table OrdersTable with no Keys",
    );
  });

  it("refuses a table named with no Keys", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch names it with an empty list of keys.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem(
        new BatchGetItemCommand({
          RequestItems: { OrdersTable: { Keys: [] } },
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "names the table OrdersTable with no Keys",
    );
  });

  it("refuses more than 100 keys, counted across tables", async () => {
    // Given two tables.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
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

    // When a batch asks for 101 keys split between them.
    const keys = (count: number): { orderId: { S: string } }[] =>
      Array.from({ length: count }, (_unused, index) => ({
        orderId: { S: `order-${String(index)}` },
      }));
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem(
        new BatchGetItemCommand({
          RequestItems: {
            OrdersTable: { Keys: keys(51) },
            ArchivedOrdersTable: { Keys: keys(50) },
          },
        }),
      ),
    );

    // Then the whole batch is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Too many items requested for the BatchGetItem call",
    );
  });

  it("refuses one key named twice for a table", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: "order-1" } },
      }),
    );

    // When a batch asks for that key twice.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem(
        new BatchGetItemCommand({
          RequestItems: {
            OrdersTable: {
              Keys: [
                { orderId: { S: "order-1" } },
                { orderId: { S: "order-1" } },
              ],
            },
          },
        }),
      ),
    );

    // Then the whole batch is refused rather than answering with the item
    // once or twice.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Provided list of item keys contains duplicates",
    );
  });

  it("refuses a Key that does not match the table's key schema", async () => {
    // Given a table keyed by a string.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch reads it by an attribute that is not part of the key.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem(
        new BatchGetItemCommand({
          RequestItems: {
            OrdersTable: {
              Keys: [{ orderId: { S: "order-1" }, note: { S: "first" } }],
            },
          },
        }),
      ),
    );

    // Then it is refused, naming the attribute at fault.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The provided key element does not match the schema",
    );
  });

  it("refuses a batch naming a table that is not there", async () => {
    // Given a simulated DynamoDB with no tables.
    const simDynamoDb = new SimAws().dynamoDb();

    // When a batch reads from one.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem(
        new BatchGetItemCommand({
          RequestItems: {
            MissingTable: { Keys: [{ orderId: { S: "order-1" } }] },
          },
        }),
      ),
    );

    // Then it is reported as not found.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });

  it("refuses a ProjectionExpression DynamoDB would refuse", async () => {
    // Given a table holding nothing.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch projects two paths where one contains the other.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem(
        new BatchGetItemCommand({
          RequestItems: {
            OrdersTable: {
              Keys: [{ orderId: { S: "order-1" } }],
              ProjectionExpression: "address, address.city",
            },
          },
        }),
      ),
    );

    // Then it is refused whether or not the keys hold anything.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Invalid ProjectionExpression");
  });

  it("refuses the legacy AttributesToGet", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch asks for part of an item the legacy way.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem(
        new BatchGetItemCommand({
          RequestItems: {
            OrdersTable: {
              Keys: [{ orderId: { S: "order-1" } }],
              AttributesToGet: ["total"],
            },
          },
        }),
      ),
    );

    // Then it is refused as unsimulated, as GetItem refuses it.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "AttributesToGet");
  });

  it("refuses reporting a capacity cost nothing measures", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch asks for its consumed capacity.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem(
        new BatchGetItemCommand({
          RequestItems: {
            OrdersTable: { Keys: [{ orderId: { S: "order-1" } }] },
          },
          ReturnConsumedCapacity: "TOTAL",
        }),
      ),
    );

    // Then it is refused as unsimulated rather than reported as zero.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "ReturnConsumedCapacity");
  });
});

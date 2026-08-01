import {
  BatchWriteItemCommand,
  CreateTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";

const ordersTable = new CreateTableCommand({
  TableName: "OrdersTable",
  KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
  AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
  BillingMode: "PAY_PER_REQUEST",
});

describe("DynamoDB BatchWriteItemCommand request validation", () => {
  it("requires RequestItems naming a table", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch names no table at all.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({ RequestItems: {} }),
      ),
    );

    // Then it is refused, since a batch has to write something.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "BatchWriteItem requires RequestItems naming at least one table",
    );
  });

  it("refuses a table named with no write requests", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch names it with an empty list.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({ RequestItems: { OrdersTable: [] } }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "names the table OrdersTable with no write requests",
    );
  });

  it("refuses a WriteRequest carrying both a put and a delete", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When one request asks for both.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({
          RequestItems: {
            OrdersTable: [
              {
                PutRequest: { Item: { orderId: { S: "order-1" } } },
                DeleteRequest: { Key: { orderId: { S: "order-1" } } },
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused rather than one of the two being guessed at.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "carries both");
  });

  it("refuses a WriteRequest carrying neither a put nor a delete", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When one request asks for neither.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({ RequestItems: { OrdersTable: [{}] } }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "carries neither");
  });

  it("requires an Item on a PutRequest", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a put carries no Item.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem({
        input: { RequestItems: { OrdersTable: [{ PutRequest: {} }] } },
      }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A PutRequest requires an Item");
  });

  it("requires a Key on a DeleteRequest", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a delete carries no Key.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem({
        input: { RequestItems: { OrdersTable: [{ DeleteRequest: {} }] } },
      }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A Key is required");
  });

  it("refuses a ConditionExpression on a PutRequest", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a put in a batch asks to be conditional.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem({
        input: {
          RequestItems: {
            OrdersTable: [
              {
                PutRequest: {
                  Item: { orderId: { S: "order-1" } },
                  ConditionExpression: "attribute_not_exists(orderId)",
                },
              },
            ],
          },
        },
      }),
    );

    // Then it is refused by name: a batch write is unconditional.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "A PutRequest takes no ConditionExpression",
    );
  });

  it("refuses a ConditionExpression on a DeleteRequest", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a delete in a batch asks to be conditional.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem({
        input: {
          RequestItems: {
            OrdersTable: [
              {
                DeleteRequest: {
                  Key: { orderId: { S: "order-1" } },
                  ConditionExpression: "attribute_exists(orderId)",
                },
              },
            ],
          },
        },
      }),
    );

    // Then it is refused by name.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "A DeleteRequest takes no ConditionExpression",
    );
  });

  it("refuses reporting a capacity cost nothing measures", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch asks for its consumed capacity.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({
          RequestItems: {
            OrdersTable: [
              { PutRequest: { Item: { orderId: { S: "order-1" } } } },
            ],
          },
          ReturnConsumedCapacity: "TOTAL",
        }),
      ),
    );

    // Then it is refused as unsimulated rather than reported as zero.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "ReturnConsumedCapacity");
  });

  it("refuses reporting item collection sizes nothing tracks", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch asks for item collection metrics.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({
          RequestItems: {
            OrdersTable: [
              { PutRequest: { Item: { orderId: { S: "order-1" } } } },
            ],
          },
          ReturnItemCollectionMetrics: "SIZE",
        }),
      ),
    );

    // Then it is refused as unsimulated.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "ReturnItemCollectionMetrics");
  });

  it("takes the reporting inputs that ask for nothing", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    // When a batch names NONE for both, which is what it already does.
    const output = await simDynamoDb.batchWriteItem(
      new BatchWriteItemCommand({
        RequestItems: {
          OrdersTable: [
            { PutRequest: { Item: { orderId: { S: "order-1" } } } },
          ],
        },
        ReturnConsumedCapacity: "NONE",
        ReturnItemCollectionMetrics: "NONE",
      }),
    );

    // Then the write goes through.
    assertObjectEquals(output.UnprocessedItems, {});
  });
});

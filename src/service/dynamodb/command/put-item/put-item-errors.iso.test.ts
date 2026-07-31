import { describe, it } from "vitest";
import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException as SimDynamoDatabaseValidationException } from "../../error/dynamodb.error.js";

describe("DynamoDB PutItemCommand errors", () => {
  it("rejects when missing partition key", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    await simDynamoDatabase.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "userId", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDatabase.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: {
            orderId: { S: "da9ee033-2a2c-4b1e-942d-3f96f4ecdf06" },
            somethingElse: { N: "12345" },
          },
        }),
      );
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "DynamoDB Item partition key userId required",
    );
  });

  it("rejects when missing sort key", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    await simDynamoDatabase.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "userId", AttributeType: "S" },
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDatabase.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: {
            userId: { S: "24ed2ef9-4276-457c-8c9b-a317bd788084" },
            somethingElse: { N: "12345" },
          },
        }),
      );
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "DynamoDB Item sort key orderId is undefined",
    );
  });

  it("rejects on invalid partition key type", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    await simDynamoDatabase.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "userId", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDatabase.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: {
            userId: { BOOL: true },
          },
        }),
      );
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "DynamoDB Item partition key userId must be string or number",
    );
  });

  it("rejects on invalid sort key type", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    await simDynamoDatabase.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "userId", AttributeType: "S" },
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDatabase.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: {
            userId: { S: "ff8cc151-1b17-4d8e-8f98-ad631b6aefa7" },
            orderId: { BOOL: true },
          },
        }),
      );
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "DynamoDB Item sort key orderId must be string or number",
    );
  });

  it("rejects undefined table name", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDatabase.putItem(
        new PutItemCommand({
          TableName: undefined,
          Item: {
            userId: { S: "57bec277-9f94-4671-a592-d1c81df9860e" },
          },
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDatabaseValidationException);
    assertStringIncludes(error.message, "A TableName is required");
  });

  it("rejects non-existent table", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDatabase.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: {
            userId: { S: "6aaaba1a-cfe8-449c-8a7b-760e4f8025cb" },
          },
        }),
      );
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(error.message, "No DynamoDB Table named FooTable");
  });

  it("rejects missing item", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    await simDynamoDatabase.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "userId", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDatabase.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: undefined,
        }),
      );
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(error.message, "PutItemCommand.input.Item required");
  });
});

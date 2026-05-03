import { describe, it } from "vitest";
import { SimAwsAccount } from "../../../organizations/sim-aws-account.js";
import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
  assertStringIncludes,
} from "@kensio/smartass";

describe("DynamoDB PutItemCommand", () => {
  it("puts new Item into DynamoDB Table, returns attributes", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
      }),
    );

    const putItemOutput = await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: {
          userId: { S: "4fad1110-e6dd-46ed-966b-356ba12f8102" },

          // Scalars
          userName: { S: "Foo McBar" },
          favouriteNumber: { N: "42" },
          likesPizza: { BOOL: true },
          missingValue: { NULL: true },

          // Binary
          profilePicture: {
            B: new Uint8Array([137, 80, 78, 71]), // "PNG" header bytes
          },

          // Sets
          favouriteColours: { SS: ["purple", "red"] },
          luckyNumbers: { NS: ["7", "13", "42"] },
          binaryTags: {
            BS: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])],
          },

          // List
          shoppingList: {
            L: [{ S: "milk" }, { S: "eggs" }],
          },

          // Map
          address: {
            M: {
              street: { S: "123 High Street" },
              city: { S: "London" },
              postcode: { S: "AB1 2CD" },
              coordinates: {
                M: {
                  lat: { N: "51.5" },
                  lon: { N: "-0.1" },
                },
              },
            },
          },
        },
      }),
    );

    assertNonNullable(putItemOutput.Attributes);

    // Scalars
    assertIdentical(
      putItemOutput.Attributes["userId"]?.S,
      "4fad1110-e6dd-46ed-966b-356ba12f8102",
    );
    assertIdentical(putItemOutput.Attributes["userName"]?.S, "Foo McBar");
    assertIdentical(putItemOutput.Attributes["favouriteNumber"]?.N, "42");
    assertTrue(putItemOutput.Attributes["likesPizza"]?.BOOL);
    assertTrue(putItemOutput.Attributes["missingValue"]?.NULL);

    // Binary
    assertBufferEqual(
      putItemOutput.Attributes["profilePicture"]?.B,
      new Uint8Array([137, 80, 78, 71]),
    );

    // Sets
    assertIdentical(
      putItemOutput.Attributes["favouriteColours"]?.SS?.[0],
      "purple",
    );

    // List
    assertIdentical(
      putItemOutput.Attributes["shoppingList"]?.L?.[0]?.S,
      "milk",
    );

    // Map
    assertIdentical(
      putItemOutput.Attributes["address"]?.M?.["street"]?.S,
      "123 High Street",
    );
    assertIdentical(putItemOutput.Attributes["address"].M["city"]?.S, "London");
    assertIdentical(
      putItemOutput.Attributes["address"].M["postcode"]?.S,
      "AB1 2CD",
    );
    assertIdentical(
      putItemOutput.Attributes["address"].M["coordinates"]?.M?.["lat"]?.N,
      "51.5",
    );
    assertIdentical(
      putItemOutput.Attributes["address"].M["coordinates"].M["lon"]?.N,
      "-0.1",
    );

    await simAccount.backgroundTasksComplete();
  });

  it("puts new Item into DynamoDB Table with partition key + sort key", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
      }),
    );

    const putItemOutput = await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: {
          userId: { S: "06a3f1a5-df48-4951-8316-6c99ca1ec662" },
          orderId: { S: "736dbd1c-e02a-4526-8534-0f1ab9314db8" },
          somethingElse: { N: "12345" },
        },
      }),
    );

    assertNonNullable(putItemOutput.Attributes);
    assertIdentical(
      putItemOutput.Attributes["userId"]?.S,
      "06a3f1a5-df48-4951-8316-6c99ca1ec662",
    );
    assertIdentical(
      putItemOutput.Attributes["orderId"]?.S,
      "736dbd1c-e02a-4526-8534-0f1ab9314db8",
    );
    assertIdentical(putItemOutput.Attributes["somethingElse"]?.N, "12345");
  });

  it("rejects when missing partition key", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDb.putItem(
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
      "DynamoDB Item partition key userId must be defined",
    );
  });

  it("rejects when missing sort key", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDb.putItem(
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
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDb.putItem(
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
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDb.putItem(
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
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDb.putItem(
        new PutItemCommand({
          TableName: undefined,
          Item: {
            userId: { S: "57bec277-9f94-4671-a592-d1c81df9860e" },
          },
        }),
      );
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "PutItemCommand.input.TableName is required",
    );
  });

  it("rejects non-existent table", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDb.putItem(
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
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: undefined,
        }),
      );
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "PutItemCommand.input.Item is required",
    );
  });
});

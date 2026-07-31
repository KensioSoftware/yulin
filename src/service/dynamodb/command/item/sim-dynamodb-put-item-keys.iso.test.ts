import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbAttributeValue } from "./item.types.js";

/**
 * Write an item real DynamoDB would refuse for its keys, and read the refusal.
 *
 * The table has a string partition key and a number sort key, so a key
 * attribute can be missing, of the wrong type, or empty.
 */
async function refusedPutItem(
  item: Record<string, SimDynamoDbAttributeValue>,
): Promise<Error> {
  const simAws = new SimAws();
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDb.createTable(
    new CreateTableCommand({
      TableName: "FooTable",
      KeySchema: [
        { AttributeName: "userId", KeyType: "HASH" },
        { AttributeName: "orderId", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "userId", AttributeType: "S" },
        { AttributeName: "orderId", AttributeType: "N" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.backgroundTasksComplete();

  return await assertThrowsErrorAsync(async () =>
    simDynamoDb.putItem({ input: { TableName: "FooTable", Item: item } }),
  );
}

describe("DynamoDB PutItemCommand key attributes", () => {
  it("refuses an item with no partition key", async () => {
    // When an item leaves out the partition key.
    const error = await refusedPutItem({ orderId: { N: "1" } });

    // Then the missing key is named.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "One of the required keys was not given a value: userId",
    );
  });

  it("refuses an item with no sort key", async () => {
    // When an item leaves out the sort key.
    const error = await refusedPutItem({ userId: { S: "user-1" } });

    // Then the missing key is named.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "One of the required keys was not given a value: orderId",
    );
  });

  it("refuses a key attribute of the wrong type", async () => {
    // When the sort key carries a string where the table declared a number.
    const error = await refusedPutItem({
      userId: { S: "user-1" },
      orderId: { S: "1" },
    });

    // Then the mismatch is reported against what the table declared.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Type mismatch for key attribute orderId, expected N but got S",
    );
  });

  it("refuses a key attribute that is a set rather than a scalar", async () => {
    // When the partition key carries a set.
    const error = await refusedPutItem({
      userId: { SS: ["user-1"] },
      orderId: { N: "1" },
    });

    // Then the mismatch is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Type mismatch for key attribute");
  });

  it("refuses an empty string as a key attribute", async () => {
    // When the partition key carries an empty string.
    const error = await refusedPutItem({
      userId: { S: "" },
      orderId: { N: "1" },
    });

    // Then it is refused, though an empty string is fine anywhere else.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The AttributeValue for key attribute userId cannot be empty",
    );
  });

  it("takes an empty string as an attribute that is not a key", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "userId", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    // When an item carries an empty string outside its key.
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-1" }, note: { S: "" } },
      }),
    );

    // Then it is written, and comes back empty as it went in.
    const output = await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-1" } },
        ReturnValues: "ALL_OLD",
      }),
    );
    assertIdentical(output.Attributes?.["note"]?.S, "");
  });
});

describe("DynamoDB PutItemCommand key identity", () => {
  it("keeps items under different keys apart", async () => {
    // Given a table with a sort key, holding one item.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "userId", AttributeType: "S" },
          { AttributeName: "orderId", AttributeType: "N" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-1" }, orderId: { N: "1" } },
      }),
    );

    // When an item with the same partition key and a different sort key is
    // written, asking for what it replaced.
    const other = await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-1" }, orderId: { N: "2" } },
        ReturnValues: "ALL_OLD",
      }),
    );

    // Then it replaced nothing, because it is a different item.
    assertUndefined(other.Attributes);

    // And the same sort key written another way is the same item, because a
    // number key compares by value.
    const same = await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-1" }, orderId: { N: "1.00" } },
        ReturnValues: "ALL_OLD",
      }),
    );
    assertIdentical(same.Attributes?.["orderId"]?.N, "1");
  });
});

describe("DynamoDB PutItemCommand binary keys", () => {
  it("writes an item keyed by binary", async () => {
    // Given a table whose partition key is binary.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [{ AttributeName: "digest", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "digest", AttributeType: "B" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: {
          digest: { B: new Uint8Array([1, 2, 3]) },
          note: { S: "first" },
        },
      }),
    );

    // When another item with the same bytes is written.
    const output = await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: {
          digest: { B: new Uint8Array([1, 2, 3]) },
          note: { S: "second" },
        },
        ReturnValues: "ALL_OLD",
      }),
    );

    // Then it replaced the first, because a binary key compares by its bytes.
    assertIdentical(output.Attributes?.["note"]?.S, "first");
  });
});

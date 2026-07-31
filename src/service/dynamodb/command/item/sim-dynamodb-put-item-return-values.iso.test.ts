import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
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
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * A table with one string partition key, ready to be written to.
 */
async function tableFor(simAws: SimAws): Promise<SimDynamoDb> {
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

  return simDynamoDb;
}

describe("DynamoDB PutItemCommand ReturnValues", () => {
  it("answers with the item it replaced when asked for ALL_OLD", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: {
          userId: { S: "user-1" },
          counter: { N: "9007199254740993" },
          note: { S: "first" },
        },
      }),
    );

    // When an item replaces it, asking for what was there.
    const output = await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-1" }, note: { S: "second" } },
        ReturnValues: "ALL_OLD",
      }),
    );

    // Then the item that was replaced comes back, digits intact. It is the
    // whole item: a put replaces rather than merges.
    const replaced = output.Attributes;
    assertNonNullable(replaced);
    assertIdentical(replaced["note"]?.S, "first");
    assertIdentical(replaced["counter"]?.N, "9007199254740993");
  });

  it("answers with nothing for ALL_OLD when there was no item", async () => {
    // Given a table with nothing in it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When the first item under a key is written, asking for what was there.
    const output = await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-1" } },
        ReturnValues: "ALL_OLD",
      }),
    );

    // Then there is nothing to answer with.
    assertUndefined(output.Attributes);
  });

  it("refuses a ReturnValues mode PutItem does not have", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a write asks for a mode only UpdateItem has.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: { userId: { S: "user-1" } },
          ReturnValues: "ALL_NEW",
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Return values set to invalid value");
  });

  it("requires an item", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a write carries no item.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem({ input: { TableName: "FooTable" } }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "An Item is required");
  });

  it("reports a table that is not there", async () => {
    // Given a simulated DynamoDB with no tables.
    const simDynamoDb = new SimAws().dynamoDb();

    // When an item is written to a table that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "MissingTable",
          Item: { userId: { S: "user-1" } },
        }),
      ),
    );

    // Then it is reported as not found.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });
});

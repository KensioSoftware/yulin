import {
  CreateTableCommand,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
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
 * A table with one string partition key, holding one item.
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

  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "FooTable",
      Item: { userId: { S: "user-1" }, note: { S: "first" } },
    }),
  );

  return simDynamoDb;
}

describe("DynamoDB DeleteItemCommand", () => {
  it("removes the item and answers with nothing", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When the item is deleted without asking for anything back.
    const output = await simDynamoDb.deleteItem(
      new DeleteItemCommand({
        TableName: "FooTable",
        Key: { userId: { S: "user-1" } },
      }),
    );

    // Then no attributes come back, and the item has gone by the time the call
    // returns.
    assertUndefined(output.Attributes);

    const read = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "FooTable",
        Key: { userId: { S: "user-1" } },
      }),
    );
    assertUndefined(read.Item);
  });

  it("answers with the item it removed when asked for ALL_OLD", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When the item is deleted, asking for what was there.
    const output = await simDynamoDb.deleteItem(
      new DeleteItemCommand({
        TableName: "FooTable",
        Key: { userId: { S: "user-1" } },
        ReturnValues: "ALL_OLD",
      }),
    );

    // Then the whole item that was removed comes back.
    const removed = output.Attributes;
    assertNonNullable(removed);
    assertIdentical(removed["userId"]?.S, "user-1");
    assertIdentical(removed["note"]?.S, "first");
  });

  it("succeeds for a key that holds nothing", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    await simDynamoDb.deleteItem(
      new DeleteItemCommand({
        TableName: "FooTable",
        Key: { userId: { S: "user-1" } },
      }),
    );

    // When the same key is deleted again, asking for what was there.
    const output = await simDynamoDb.deleteItem(
      new DeleteItemCommand({
        TableName: "FooTable",
        Key: { userId: { S: "user-1" } },
        ReturnValues: "ALL_OLD",
      }),
    );

    // Then it succeeds with nothing removed: DeleteItem names a key rather
    // than an item, so it is idempotent.
    assertUndefined(output.Attributes);
  });

  it("leaves the items under other keys alone", async () => {
    // Given a table holding two items.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-2" }, note: { S: "second" } },
      }),
    );

    // When one of them is deleted.
    await simDynamoDb.deleteItem(
      new DeleteItemCommand({
        TableName: "FooTable",
        Key: { userId: { S: "user-1" } },
      }),
    );

    // Then the other is still there.
    const read = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "FooTable",
        Key: { userId: { S: "user-2" } },
      }),
    );
    assertIdentical(read.Item?.["note"]?.S, "second");
  });

  it("refuses a ReturnValues mode DeleteItem does not have", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a delete asks for a mode only UpdateItem has.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.deleteItem(
        new DeleteItemCommand({
          TableName: "FooTable",
          Key: { userId: { S: "user-1" } },
          ReturnValues: "ALL_NEW",
        }),
      ),
    );

    // Then it is refused, naming the command that will not take it.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Return values set to invalid value");
    assertStringIncludes(error.message, "DeleteItem takes NONE or ALL_OLD");
  });

  it("requires a Key", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a delete carries no Key.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.deleteItem({ input: { TableName: "FooTable" } }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A Key is required");
  });

  it("reports a table that is not there", async () => {
    // Given a simulated DynamoDB with no tables.
    const simDynamoDb = new SimAws().dynamoDb();

    // When an item is deleted from a table that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.deleteItem(
        new DeleteItemCommand({
          TableName: "MissingTable",
          Key: { userId: { S: "user-1" } },
        }),
      ),
    );

    // Then it is reported as not found.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });
});

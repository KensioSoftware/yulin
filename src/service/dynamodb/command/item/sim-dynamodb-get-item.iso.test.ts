import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
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
      Item: {
        userId: { S: "user-1" },
        counter: { N: "9007199254740993" },
        note: { S: "first" },
      },
    }),
  );

  return simDynamoDb;
}

describe("DynamoDB GetItemCommand", () => {
  it("answers with the item a write just left", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When the item is read by its primary key.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "FooTable",
        Key: { userId: { S: "user-1" } },
      }),
    );

    // Then the whole item comes back, digits intact.
    const item = output.Item;
    assertNonNullable(item);
    assertIdentical(item["note"]?.S, "first");
    assertIdentical(item["counter"]?.N, "9007199254740993");
  });

  it("omits the item altogether for a key that holds nothing", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a key nothing was written under is read.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "FooTable",
        Key: { userId: { S: "nobody" } },
      }),
    );

    // Then there is no Item at all, rather than an empty one, which is how a
    // miss is told from an item carrying nothing but its key.
    assertUndefined(output.Item);
  });

  it("answers with an item carrying nothing but its key", async () => {
    // Given a table holding an item with no attributes beyond its key.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-2" } },
      }),
    );

    // When it is read.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "FooTable",
        Key: { userId: { S: "user-2" } },
      }),
    );

    // Then the Item is there, holding only the key.
    const item = output.Item;
    assertNonNullable(item);
    assertArrayLength(Object.keys(item), 1);
    assertIdentical(item["userId"]?.S, "user-2");
  });

  it.each([true, false])(
    "answers with the latest write for ConsistentRead %s",
    async (consistentRead) => {
      // Given a table holding an item that has just been replaced.
      const simAws = new SimAws();
      const simDynamoDb = await tableFor(simAws);

      await simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: { userId: { S: "user-1" }, note: { S: "second" } },
        }),
      );

      // When the item is read either consistently or not.
      const output = await simDynamoDb.getItem(
        new GetItemCommand({
          TableName: "FooTable",
          Key: { userId: { S: "user-1" } },
          ConsistentRead: consistentRead,
        }),
      );

      // Then the latest write comes back either way: this simulation is always
      // strongly consistent.
      assertIdentical(output.Item?.["note"]?.S, "second");
    },
  );

  it("reads an item by the table ARN", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    const description = await simDynamoDb.describeTable({
      input: { TableName: "FooTable" },
    });
    const tableArn = description.Table?.TableArn;
    assertNonNullable(tableArn);

    // When the item is read by the table's ARN rather than its name.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: tableArn,
        Key: { userId: { S: "user-1" } },
      }),
    );

    // Then it is the same table.
    assertIdentical(output.Item?.["note"]?.S, "first");
  });

  it("requires a Key", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a read carries no Key.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.getItem({ input: { TableName: "FooTable" } }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A Key is required");
  });

  it("refuses an empty Key", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a read carries a Key naming no attribute at all.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.getItem(
        new GetItemCommand({ TableName: "FooTable", Key: {} }),
      ),
    );

    // Then it is refused, since it names no item.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A Key is required");
  });

  it("reports a table that is not there", async () => {
    // Given a simulated DynamoDB with no tables.
    const simDynamoDb = new SimAws().dynamoDb();

    // When an item is read from a table that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.getItem(
        new GetItemCommand({
          TableName: "MissingTable",
          Key: { userId: { S: "user-1" } },
        }),
      ),
    );

    // Then it is reported as not found.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });
});

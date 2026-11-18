import {
  CreateTableCommand,
  DeleteItemCommand,
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
  SimDynamoDbConditionalCheckFailedException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type {
  SimDeleteItemCommandInput,
  SimPutItemCommandInput,
} from "./item.command.js";

const itemInput = {
  TableName: "FooTable",
  Item: { userId: { S: "user-1" } },
} as const satisfies SimPutItemCommandInput;

const keyInput = {
  TableName: "FooTable",
  Key: { userId: { S: "user-1" } },
} as const satisfies SimDeleteItemCommandInput;

/**
 * A table to read from and write to.
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

describe("DynamoDB PutItemCommand input", () => {
  it("refuses a put the Expected entry rules out", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await simDynamoDb.putItem(new PutItemCommand(itemInput));

    // When a put expects the key to be free the legacy way.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem({
        input: { ...itemInput, Expected: { userId: { Exists: false } } },
      }),
    );

    // Then the condition fails, as a ConditionExpression would.
    assertInstanceOf(error, SimDynamoDbConditionalCheckFailedException);
  });

  it("refuses ConditionalOperator with no Expected to join", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a put carries the operator alone.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem({
        input: { ...itemInput, ConditionalOperator: "AND" },
      }),
    );

    // Then it is refused for having nothing to join.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "ConditionalOperator");
  });

  it("writes an item for input that asks for none of it", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a write names the defaults, which ask for nothing.
    const output = await simDynamoDb.putItem(
      new PutItemCommand({
        ...itemInput,
        ReturnConsumedCapacity: "NONE",
        ReturnItemCollectionMetrics: "NONE",
        ReturnValues: "NONE",
      }),
    );

    // Then nothing is refused, and the item is there for the next write to
    // replace.
    assertUndefined(output.Attributes);

    const replacing = await simDynamoDb.putItem(
      new PutItemCommand({ ...itemInput, ReturnValues: "ALL_OLD" }),
    );
    assertIdentical(replacing.Attributes?.["userId"]?.S, "user-1");
  });
});

describe("DynamoDB DeleteItemCommand input", () => {
  it("deletes when the Expected value matches", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await simDynamoDb.putItem(new PutItemCommand(itemInput));

    // When a delete expects the value the item holds.
    await simDynamoDb.deleteItem(
      new DeleteItemCommand({
        ...keyInput,
        Expected: { userId: { Value: { S: "user-1" } } },
      }),
    );

    // Then the item is gone.
    const read = await simDynamoDb.getItem({ input: keyInput });
    assertUndefined(read.Item);
  });

  it("deletes an item for input that asks for none of it", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await simDynamoDb.putItem(new PutItemCommand(itemInput));

    // When a delete names the defaults, which ask for nothing.
    const output = await simDynamoDb.deleteItem(
      new DeleteItemCommand({
        ...keyInput,
        ReturnConsumedCapacity: "NONE",
        ReturnItemCollectionMetrics: "NONE",
        ReturnValues: "ALL_OLD",
      }),
    );

    // Then nothing is refused, and the item is the one that was removed.
    assertIdentical(output.Attributes?.["userId"]?.S, "user-1");
  });
});

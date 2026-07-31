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
import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
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
 * The reporting and legacy conditional inputs PutItem and DeleteItem share.
 */
const writeInputs = [
  {
    named: "ReturnConsumedCapacity",
    input: { ReturnConsumedCapacity: "TOTAL" },
  },
  {
    named: "ReturnItemCollectionMetrics",
    input: { ReturnItemCollectionMetrics: "SIZE" },
  },
  {
    named: "Expected",
    input: { Expected: { userId: { Exists: false } } },
  },
  {
    named: "ConditionalOperator",
    input: { ConditionalOperator: "AND" },
  },
] as const satisfies readonly {
  named: string;
  input: SimDeleteItemCommandInput;
}[];

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

describe("DynamoDB PutItemCommand unsimulated input", () => {
  it.each(writeInputs)("refuses $named", async ({ named, input }) => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a write asks for something this simulation does not model.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem({ input: { ...itemInput, ...input } }),
    );

    // Then it is refused by name, rather than quietly ignored.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, named);
    assertStringIncludes(error.message, "PutItem");
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

describe("DynamoDB DeleteItemCommand unsimulated input", () => {
  it.each(writeInputs)("refuses $named", async ({ named, input }) => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a delete asks for something this simulation does not model.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.deleteItem({ input: { ...keyInput, ...input } }),
    );

    // Then it is refused by name, naming the command that will not take it.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, named);
    assertStringIncludes(error.message, "DeleteItem");
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

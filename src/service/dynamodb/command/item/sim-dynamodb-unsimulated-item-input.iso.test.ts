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
import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimPutItemCommandInput } from "./item.command.js";

const itemInput = {
  TableName: "FooTable",
  Item: { userId: { S: "user-1" } },
} as const satisfies SimPutItemCommandInput;

/**
 * A table to write to.
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

/**
 * Write an item asking for something the simulation does not model.
 */
async function refusedPutItem(input: SimPutItemCommandInput): Promise<Error> {
  const simAws = new SimAws();
  const simDynamoDb = await tableFor(simAws);

  return await assertThrowsErrorAsync(async () =>
    simDynamoDb.putItem({ input }),
  );
}

describe("DynamoDB PutItemCommand unsimulated input", () => {
  it.each([
    {
      named: "ConditionExpression",
      input: { ConditionExpression: "attribute_not_exists(userId)" },
    },
    {
      named: "ExpressionAttributeNames",
      input: { ExpressionAttributeNames: { "#u": "userId" } },
    },
    {
      named: "ExpressionAttributeValues",
      input: { ExpressionAttributeValues: { ":u": { S: "user-1" } } },
    },
    {
      named: "ReturnConsumedCapacity",
      input: { ReturnConsumedCapacity: "TOTAL" },
    },
    {
      named: "ReturnItemCollectionMetrics",
      input: { ReturnItemCollectionMetrics: "SIZE" },
    },
    {
      named: "ReturnValuesOnConditionCheckFailure",
      input: { ReturnValuesOnConditionCheckFailure: "ALL_OLD" },
    },
    {
      named: "Expected",
      input: { Expected: { userId: { Exists: false } } },
    },
    {
      named: "ConditionalOperator",
      input: { ConditionalOperator: "AND" },
    },
  ])("refuses $named", async ({ named, input }) => {
    // When a write asks for something this simulation does not model.
    const error = await refusedPutItem({ ...itemInput, ...input });

    // Then it is refused by name, rather than quietly ignored.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, named);
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

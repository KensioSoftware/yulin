import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimGetItemCommandInput } from "./item.command.js";

const keyInput = {
  TableName: "FooTable",
  Key: { userId: { S: "user-1" } },
} as const satisfies SimGetItemCommandInput;

/**
 * A table holding one item to read.
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

describe("DynamoDB GetItemCommand unsimulated input", () => {
  it.each([
    {
      named: "ProjectionExpression",
      input: { ProjectionExpression: "userId, note" },
    },
    {
      named: "ExpressionAttributeNames",
      input: { ExpressionAttributeNames: { "#u": "userId" } },
    },
    {
      named: "AttributesToGet",
      input: { AttributesToGet: ["userId"] },
    },
    {
      named: "ReturnConsumedCapacity",
      input: { ReturnConsumedCapacity: "TOTAL" },
    },
  ] as const satisfies readonly {
    named: string;
    input: SimGetItemCommandInput;
  }[])("refuses $named", async ({ named, input }) => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a read asks for something this simulation does not model.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.getItem({ input: { ...keyInput, ...input } }),
    );

    // Then it is refused by name, rather than answering with the whole item.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, named);
    assertStringIncludes(error.message, "GetItem");
  });

  it("reads an item for input that asks for none of it", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a read names the defaults, which ask for nothing.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        ...keyInput,
        ConsistentRead: true,
        ReturnConsumedCapacity: "NONE",
      }),
    );

    // Then nothing is refused, and the item comes back.
    assertIdentical(output.Item?.["note"]?.S, "first");
  });
});

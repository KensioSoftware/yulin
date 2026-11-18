import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
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

describe("DynamoDB GetItemCommand input", () => {
  it("answers with the attributes AttributesToGet names", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a read asks for part of it the legacy way.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({ ...keyInput, AttributesToGet: ["note"] }),
    );

    // Then only that part comes back.
    assertObjectEquals(output.Item, { note: { S: "first" } });
  });

  it("refuses AttributesToGet naming one attribute twice", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a read names the same attribute twice.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.getItem({
        input: { ...keyInput, AttributesToGet: ["note", "note"] },
      }),
    );

    // Then it is refused, as AWS refuses it.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Duplicate value in attribute name");
  });

  it("refuses an AttributesToGet name over 65,535 characters", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a read names an attribute one character too long.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.getItem({
        input: { ...keyInput, AttributesToGet: ["a".repeat(65_536)] },
      }),
    );

    // Then it is refused for the length of the name.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "an attribute of 65536 characters");
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

  it("refuses ExpressionAttributeNames with no expression to use them in", async () => {
    // Given a table holding an item.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a read defines names and carries no expression.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.getItem({
        input: { ...keyInput, ExpressionAttributeNames: { "#n": "note" } },
      }),
    );

    // Then it is a ValidationException, as on AWS, since nothing would ever
    // read them.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "ExpressionAttributeNames can only be specified when using expressions",
    );
  });
});

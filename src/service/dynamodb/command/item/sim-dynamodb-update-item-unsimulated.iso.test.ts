import {
  CreateTableCommand,
  PutItemCommand,
  UpdateItemCommand,
  type UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * A table holding one order with a counter and a list on it.
 */
async function tableFor(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDb.createTable(
    new CreateTableCommand({
      TableName: "FooTable",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.backgroundTasksComplete();

  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "FooTable",
      Item: {
        orderId: { S: "order-1" },
        counter: { N: "1" },
        lines: { L: [{ S: "first" }] },
      },
    }),
  );

  return simDynamoDb;
}

/**
 * The error an update on that order is refused with.
 */
async function refusalOf(
  simDynamoDb: SimDynamoDb,
  input: Omit<UpdateItemCommandInput, "TableName" | "Key">,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () =>
    simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        ...input,
      }),
    ),
  );
}

describe("DynamoDB UpdateItemCommand unsimulated input", () => {
  it("refuses the ADD clause", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update asks to add to a number.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "ADD counter :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then it is refused by name, rather than left out of the change.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "The ADD clause");
  });

  it("refuses the DELETE clause", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update asks to take a member out of a set.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "DELETE colours :red",
      ExpressionAttributeValues: { ":red": { SS: ["red"] } },
    });

    // Then it is refused by name.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "The DELETE clause");
  });

  it("refuses arithmetic in a SET action", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update counts up.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET counter = counter + :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then it is refused by name rather than as an unexpected character.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "Arithmetic in an update expression");
  });

  it("refuses subtraction in a SET action", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update counts down.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET counter = counter - :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then it is refused the same way.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "Arithmetic in an update expression");
  });

  it("refuses a function it does not apply", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update appends to a list.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET lines = list_append(lines, :more)",
      ExpressionAttributeValues: { ":more": { L: [{ S: "second" }] } },
    });

    // Then the function is refused by name.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(
      error.message,
      "The update expression function list_append",
    );
  });

  it("refuses writing to a list element", async () => {
    // Given a table holding an order with a list on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update assigns to one element of that list.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET lines[0] = :line",
      ExpressionAttributeValues: { ":line": { S: "second" } },
    });

    // Then it is refused, since nothing here shifts a list around.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "The list element path 'lines[0]'");
  });

  it("refuses removing a list element", async () => {
    // Given a table holding an order with a list on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update removes one element of that list.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "REMOVE lines[0]",
    });

    // Then it is refused the same way.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "The list element path 'lines[0]'");
  });

  it("refuses the legacy AttributeUpdates", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update says what to change the old way.
    const error = await refusalOf(simDynamoDb, {
      AttributeUpdates: {
        status: { Value: { S: "shipped" }, Action: "PUT" },
      },
    });

    // Then it is refused by name, rather than leaving the item unchanged.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "AttributeUpdates is not simulated");
  });
});

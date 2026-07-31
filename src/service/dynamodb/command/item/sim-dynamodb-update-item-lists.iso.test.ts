import {
  type AttributeValue,
  CreateTableCommand,
  PutItemCommand,
  UpdateItemCommand,
  type UpdateItemCommandInput,
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
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * A table holding one order with a list of lines on it.
 */
async function tableFor(
  simAws: SimAws,
  item: Record<string, AttributeValue>,
): Promise<SimDynamoDb> {
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
      Item: { orderId: { S: "order-1" }, ...item },
    }),
  );

  return simDynamoDb;
}

/**
 * A list of strings, as an item carries one.
 */
function listOf(...texts: readonly string[]): AttributeValue {
  return { L: texts.map((text) => ({ S: text })) };
}

/**
 * The lines an update leaves on the order.
 */
async function linesAfter(
  simDynamoDb: SimDynamoDb,
  input: Omit<UpdateItemCommandInput, "TableName" | "Key">,
): Promise<readonly (string | undefined)[]> {
  const output = await simDynamoDb.updateItem(
    new UpdateItemCommand({
      TableName: "FooTable",
      Key: { orderId: { S: "order-1" } },
      ReturnValues: "ALL_NEW",
      ...input,
    }),
  );

  const lines = output.Attributes?.["lines"]?.L;
  assertNonNullable(lines);

  return lines.map((line) => line.S);
}

/**
 * The error an update is refused with.
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

describe("DynamoDB UpdateItemCommand lists", () => {
  it("appends to a list with list_append", async () => {
    // Given an order with two lines on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { lines: listOf("a", "b") });

    // When an update appends another.
    const lines = await linesAfter(simDynamoDb, {
      UpdateExpression: "SET lines = list_append(lines, :more)",
      ExpressionAttributeValues: { ":more": listOf("c") },
    });

    // Then the arguments went end to end in the order they were written.
    assertIdentical(lines.join(","), "a,b,c");
  });

  it("prepends to a list by writing the arguments the other way round", async () => {
    // Given an order with two lines on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { lines: listOf("b", "c") });

    // When the stored list is the second argument.
    const lines = await linesAfter(simDynamoDb, {
      UpdateExpression: "SET lines = list_append(:first, lines)",
      ExpressionAttributeValues: { ":first": listOf("a") },
    });

    // Then it went on the end of the one the request carried.
    assertIdentical(lines.join(","), "a,b,c");
  });

  it("refuses list_append on something that is not a list", async () => {
    // Given an order whose reference is a string.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { reference: { S: "abc" } });

    // When an update appends to it.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET reference = list_append(reference, :more)",
      ExpressionAttributeValues: { ":more": listOf("d") },
    });

    // Then it is refused, naming the function and the type it was given.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "list_append");
    assertStringIncludes(error.message, "operand type: S");
  });

  it("writes one element of a list", async () => {
    // Given an order with three lines on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      lines: listOf("a", "b", "c"),
    });

    // When an update assigns to the middle one.
    const lines = await linesAfter(simDynamoDb, {
      UpdateExpression: "SET lines[1] = :line",
      ExpressionAttributeValues: { ":line": { S: "B" } },
    });

    // Then that element changed and the others did not.
    assertIdentical(lines.join(","), "a,B,c");
  });

  it("appends when the index is past the end of the list", async () => {
    // Given an order with two lines on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { lines: listOf("a", "b") });

    // When an update writes well past the end.
    const lines = await linesAfter(simDynamoDb, {
      UpdateExpression: "SET lines[9] = :line",
      ExpressionAttributeValues: { ":line": { S: "c" } },
    });

    // Then the element went on the end rather than leaving a gap behind it.
    assertIdentical(lines.join(","), "a,b,c");
  });

  it("closes the list up when an element is removed", async () => {
    // Given an order with three lines on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      lines: listOf("a", "b", "c"),
    });

    // When an update removes the first.
    const lines = await linesAfter(simDynamoDb, {
      UpdateExpression: "REMOVE lines[0]",
    });

    // Then the ones after it moved down.
    assertIdentical(lines.join(","), "b,c");
  });

  it("removes several elements by the indexes they had before the update", async () => {
    // Given an order with four lines on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      lines: listOf("a", "b", "c", "d"),
    });

    // When one expression removes the first two.
    const lines = await linesAfter(simDynamoDb, {
      UpdateExpression: "REMOVE lines[0], lines[1]",
    });

    // Then both indexes meant what they meant against the stored list, rather
    // than the second one landing on what the first removal shifted down.
    assertIdentical(lines.join(","), "c,d");
  });

  it("appends in the order the actions were written", async () => {
    // Given an order with one line on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { lines: listOf("a") });

    // When one expression writes past the end twice.
    const lines = await linesAfter(simDynamoDb, {
      UpdateExpression: "SET lines[8] = :first, lines[9] = :second",
      ExpressionAttributeValues: {
        ":first": { S: "b" },
        ":second": { S: "c" },
      },
    });

    // Then they went on in the order they were written.
    assertIdentical(lines.join(","), "a,b,c");
  });

  it("refuses writing an element of an attribute that is not a list", async () => {
    // Given an order with no lines on it at all.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {});

    // When an update writes an element of that missing attribute.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET lines[0] = :line",
      ExpressionAttributeValues: { ":line": { S: "a" } },
    });

    // Then it is refused, as an update does not make the list on the way past.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The document path provided in the update expression is invalid for update",
    );
  });

  it("removes an attribute inside a list element", async () => {
    // Given an order whose lines are maps.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      lines: { L: [{ M: { sku: { S: "a" }, note: { S: "gift" } } }] },
    });

    // When an update removes one attribute of the first line.
    const output = await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "REMOVE lines[0].note",
        ReturnValues: "ALL_NEW",
      }),
    );

    // Then the line is still there without it.
    const first = output.Attributes?.["lines"]?.L?.[0]?.M;
    assertNonNullable(first);
    assertIdentical(first["sku"]?.S, "a");
    assertUndefined(first["note"]);
  });

  it("changes nothing when a removal indexes something that is not a list", async () => {
    // Given an order whose reference is a string.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { reference: { S: "abc" } });

    // When a removal indexes into it.
    const output = await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "REMOVE reference[0]",
        ReturnValues: "ALL_NEW",
      }),
    );

    // Then there was no element to remove, and the attribute is as it was.
    assertIdentical(output.Attributes?.["reference"]?.S, "abc");
  });

  it("refuses list_append against an attribute that is not there", async () => {
    // Given an order with no lines on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {});

    // When an update appends to that missing attribute.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET lines = list_append(lines, :more)",
      ExpressionAttributeValues: { ":more": listOf("a") },
    });

    // Then it is refused, as it is for any operand pointing at nothing.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "refers to an attribute that does not exist in the item",
    );
  });

  it("refuses a function an update expression does not have", async () => {
    // Given an order with two lines on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { lines: listOf("a", "b") });

    // When an update calls something else.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET lines = list_concat(lines, :more)",
      ExpressionAttributeValues: { ":more": listOf("c") },
    });

    // Then it is refused by name.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Invalid function name");
  });
});

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
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimDynamoDbAttributeValue } from "./item.types.js";

/**
 * A table holding one page with a view count on it.
 */
async function tableFor(
  simAws: SimAws,
  item: Record<string, AttributeValue>,
): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDb.createTable(
    new CreateTableCommand({
      TableName: "FooTable",
      KeySchema: [{ AttributeName: "pageId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "pageId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.backgroundTasksComplete();

  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "FooTable",
      Item: { pageId: { S: "page-1" }, ...item },
    }),
  );

  return simDynamoDb;
}

/**
 * The item an update leaves, read back through ALL_NEW.
 */
async function updated(
  simDynamoDb: SimDynamoDb,
  input: Omit<UpdateItemCommandInput, "TableName" | "Key">,
): Promise<Readonly<Record<string, SimDynamoDbAttributeValue>>> {
  const output = await simDynamoDb.updateItem(
    new UpdateItemCommand({
      TableName: "FooTable",
      Key: { pageId: { S: "page-1" } },
      ReturnValues: "ALL_NEW",
      ...input,
    }),
  );

  assertNonNullable(output.Attributes);

  return output.Attributes;
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
        Key: { pageId: { S: "page-1" } },
        ...input,
      }),
    ),
  );
}

describe("DynamoDB UpdateItemCommand arithmetic", () => {
  it("counts a stored number up", async () => {
    // Given a page that has been viewed twice.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { views: { N: "2" } });

    // When an update adds one to the count.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "SET views = views + :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then the stored number went up by one.
    assertIdentical(item["views"]?.N, "3");
  });

  it("counts a stored number down", async () => {
    // Given a page with ten credits left.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { credits: { N: "10" } });

    // When an update takes some away.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "SET credits = credits - :spent",
      ExpressionAttributeValues: { ":spent": { N: "2.5" } },
    });

    // Then the difference is exact rather than rounded.
    assertIdentical(item["credits"]?.N, "7.5");
  });

  it("counts below zero", async () => {
    // Given a page with two credits left.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { credits: { N: "2" } });

    // When an update takes more away than it has.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "SET credits = credits - :spent",
      ExpressionAttributeValues: { ":spent": { N: "5" } },
    });

    // Then the number went negative, as DynamoDB numbers do.
    assertIdentical(item["credits"]?.N, "-3");
  });

  it("adds numbers past what a JavaScript number holds", async () => {
    // Given a counter past the range a double counts in whole numbers.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      counter: { N: "9007199254740993" },
    });

    // When one is added to it.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "SET counter = counter + :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then the answer is exact. A double based implementation answers
    // 9007199254740992 here, which is not even the number it started from.
    assertIdentical(item["counter"]?.N, "9007199254740994");
  });

  it("starts a counter that is not there yet with if_not_exists", async () => {
    // Given a page with no view count on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {});

    // When the usual counter form counts a first view.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "SET views = if_not_exists(views, :zero) + :one",
      ExpressionAttributeValues: { ":zero": { N: "0" }, ":one": { N: "1" } },
    });

    // Then the count started from the value if_not_exists stood in with.
    assertIdentical(item["views"]?.N, "1");
  });

  it("refuses arithmetic against an attribute that is not there", async () => {
    // Given a page with no view count on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {});

    // When an update counts up without guarding the missing attribute.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET views = views + :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then it is refused rather than counted from zero, which is why the
    // counter form goes through if_not_exists.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "refers to an attribute that does not exist in the item",
    );
  });

  it("refuses arithmetic on something that is not a number", async () => {
    // Given a page whose title is a string.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { title: { S: "Home" } });

    // When an update adds a number to it.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET title = title + :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then it is refused, naming the operator and the type it was given.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "operator or function: +");
    assertStringIncludes(error.message, "operand type: S");
  });

  it("refuses a second operator in one sum", async () => {
    // Given a page that has been viewed twice.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { views: { N: "2" } });

    // When an update chains two operators.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET views = views + :one + :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then it is refused, as DynamoDB takes one operator between two operands.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "starts a third");
  });

  it("refuses brackets around a sum", async () => {
    // Given a page that has been viewed twice.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { views: { N: "2" } });

    // When an update brackets its arithmetic.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET views = (views + :one)",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then it is a syntax error, since an update expression has no brackets.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Invalid UpdateExpression");
  });

  it("refuses a total wider than a DynamoDB number carries", async () => {
    // Given a counter big enough that adding one to it needs 39 digits.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      counter: { N: `1${"0".repeat(38)}` },
    });

    // When one is added to it.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET counter = counter + :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then the total is refused the same way a number a request wrote would
    // be, rather than quietly losing the digit that did not fit.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "significant digits");
  });
});

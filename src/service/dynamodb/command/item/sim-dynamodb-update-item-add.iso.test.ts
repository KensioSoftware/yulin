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
 * A table holding one article with whatever attributes a test gives it.
 */
async function tableFor(
  simAws: SimAws,
  item: Record<string, AttributeValue>,
): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDb.createTable(
    new CreateTableCommand({
      TableName: "FooTable",
      KeySchema: [{ AttributeName: "articleId", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "articleId", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.backgroundTasksComplete();

  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "FooTable",
      Item: { articleId: { S: "article-1" }, ...item },
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
      Key: { articleId: { S: "article-1" } },
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
        Key: { articleId: { S: "article-1" } },
        ...input,
      }),
    ),
  );
}

describe("DynamoDB UpdateItemCommand ADD", () => {
  it("adds to a stored number", async () => {
    // Given an article read three times.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { reads: { N: "3" } });

    // When an ADD counts two more.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "ADD reads :more",
      ExpressionAttributeValues: { ":more": { N: "2" } },
    });

    // Then the two were added mathematically.
    assertIdentical(item["reads"]?.N, "5");
  });

  it("treats an attribute that is not there as zero", async () => {
    // Given an article nobody has read.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {});

    // When an ADD counts the first read.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "ADD reads :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then the attribute was created at the value that was added.
    assertIdentical(item["reads"]?.N, "1");
  });

  it("counts down when the value is negative", async () => {
    // Given an article with five credits on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { credits: { N: "5" } });

    // When an ADD carries a negative number.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "ADD credits :spent",
      ExpressionAttributeValues: { ":spent": { N: "-2" } },
    });

    // Then it took that much away, which is the only way ADD subtracts.
    assertIdentical(item["credits"]?.N, "3");
  });

  it("adds members to a stored string set", async () => {
    // Given an article tagged twice.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      tags: { SS: ["news", "sport"] },
    });

    // When an ADD carries a tag it already has and one it does not.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "ADD tags :added",
      ExpressionAttributeValues: { ":added": { SS: ["sport", "archived"] } },
    });

    // Then the set holds each member once.
    assertIdentical(item["tags"]?.SS?.join(","), "news,sport,archived");
  });

  it("creates the set when the attribute is not there", async () => {
    // Given an article with no tags.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {});

    // When an ADD carries a set.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "ADD tags :added",
      ExpressionAttributeValues: { ":added": { SS: ["news"] } },
    });

    // Then the attribute became the set the request carried.
    assertIdentical(item["tags"]?.SS?.join(","), "news");
  });

  it("counts a number set member by its value rather than its text", async () => {
    // Given an article scored 1 and 2.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { scores: { NS: ["1", "2"] } });

    // When an ADD carries the same numbers written differently.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "ADD scores :added",
      ExpressionAttributeValues: { ":added": { NS: ["1.0", "3"] } },
    });

    // Then 1.0 was the member the set already held.
    assertIdentical(item["scores"]?.NS?.join(","), "1,2,3");
  });

  it("counts a binary set member by its bytes", async () => {
    // Given an article holding one binary fingerprint.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      prints: { BS: [Uint8Array.from([1, 2])] },
    });

    // When an ADD carries the same bytes in a different array, and new ones.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "ADD prints :added",
      ExpressionAttributeValues: {
        ":added": { BS: [Uint8Array.from([1, 2]), Uint8Array.from([3])] },
      },
    });

    // Then the bytes it already held were not added twice.
    assertIdentical(item["prints"]?.BS?.length, 2);
  });

  it("refuses a set of a different kind to the stored one", async () => {
    // Given an article tagged with strings.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { tags: { SS: ["news"] } });

    // When an ADD carries a number set.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "ADD tags :added",
      ExpressionAttributeValues: { ":added": { NS: ["1"] } },
    });

    // Then it is refused rather than mixing the two kinds together.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "incorrect data type");
    assertStringIncludes(error.message, "ADD cannot apply a NS to the SS");
  });

  it("refuses an attribute that is neither a number nor a set", async () => {
    // Given an article whose title is a string.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { title: { S: "Home" } });

    // When an ADD carries a number for it.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "ADD title :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then it is refused, as real DynamoDB takes ADD on a Number or a set.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "ADD cannot apply a N to the S");
  });

  it("refuses a value that is neither a number nor a set", async () => {
    // Given an article with no tags.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {});

    // When an ADD carries a plain string.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "ADD tags :added",
      ExpressionAttributeValues: { ":added": { S: "news" } },
    });

    // Then it is refused, naming the type it was given.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "operator: ADD, operand type: S");
  });

  it("refuses a document path inside another attribute", async () => {
    // Given an article carrying a map.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      counts: { M: { reads: { N: "1" } } },
    });

    // When an ADD names something inside it.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "ADD counts.reads :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then it is refused, as ADD works on a top-level attribute on AWS too.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "ADD works on an attribute of the item",
    );
  });

  it("refuses an action that runs out before its value", async () => {
    // Given an article read three times.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { reads: { N: "3" } });

    // When an ADD names the attribute and stops.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "ADD reads",
    });

    // Then it is refused, saying where the expression ran out.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "the end of the expression");
  });

  it("refuses a document path where a value was expected", async () => {
    // Given an article read three times.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { reads: { N: "3" } });

    // When an ADD names another attribute rather than a value.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "ADD reads other",
    });

    // Then it is refused, since ADD adds an amount the request carries.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "ExpressionAttributeValues");
  });

  it("refuses a set against an attribute that holds something else", async () => {
    // Given an article whose title is a string.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { title: { S: "Home" } });

    // When an ADD carries a set for it.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "ADD title :added",
      ExpressionAttributeValues: { ":added": { SS: ["news"] } },
    });

    // Then it is refused rather than replacing the string with a set.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "ADD cannot apply a SS to the S");
  });
});

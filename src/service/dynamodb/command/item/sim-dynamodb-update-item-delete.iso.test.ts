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

describe("DynamoDB UpdateItemCommand DELETE", () => {
  it("takes members out of a stored set", async () => {
    // Given an article tagged three times.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      tags: { SS: ["news", "sport", "archived"] },
    });

    // When a DELETE names one of them.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "DELETE tags :gone",
      ExpressionAttributeValues: { ":gone": { SS: ["sport"] } },
    });

    // Then the rest of the set is as it was.
    assertIdentical(item["tags"]?.SS?.join(","), "news,archived");
  });

  it("takes the attribute away when the last member goes", async () => {
    // Given an article with one tag left.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { tags: { SS: ["news"] } });

    // When a DELETE names it.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "DELETE tags :gone",
      ExpressionAttributeValues: { ":gone": { SS: ["news"] } },
    });

    // Then the attribute went with it, since DynamoDB holds no empty set.
    assertUndefined(item["tags"]);
    assertIdentical(item["articleId"]?.S, "article-1");
  });

  it("changes nothing when the set does not hold the member", async () => {
    // Given an article tagged once.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { tags: { SS: ["news"] } });

    // When a DELETE names a tag it does not have.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "DELETE tags :gone",
      ExpressionAttributeValues: { ":gone": { SS: ["sport"] } },
    });

    // Then the set is as it was.
    assertIdentical(item["tags"]?.SS?.join(","), "news");
  });

  it("changes nothing when the attribute is not there", async () => {
    // Given an article with no tags at all.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { title: { S: "Home" } });

    // When a DELETE names one anyway.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "DELETE tags :gone",
      ExpressionAttributeValues: { ":gone": { SS: ["news"] } },
    });

    // Then the update succeeded and made no attribute to hold nothing.
    assertUndefined(item["tags"]);
    assertIdentical(item["title"]?.S, "Home");
  });

  it("matches a number set member by its value", async () => {
    // Given an article scored 1 and 2.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { scores: { NS: ["1", "2"] } });

    // When a DELETE names the same number written differently.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "DELETE scores :gone",
      ExpressionAttributeValues: { ":gone": { NS: ["1.0"] } },
    });

    // Then it was the member the set held.
    assertIdentical(item["scores"]?.NS?.join(","), "2");
  });

  it("matches a binary set member by its bytes", async () => {
    // Given an article holding two binary fingerprints.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      prints: { BS: [Uint8Array.from([1, 2]), Uint8Array.from([3])] },
    });

    // When a DELETE carries the same bytes in a different array.
    const item = await updated(simDynamoDb, {
      UpdateExpression: "DELETE prints :gone",
      ExpressionAttributeValues: {
        ":gone": { BS: [Uint8Array.from([1, 2])] },
      },
    });

    // Then that member went, rather than being kept as a different object.
    assertIdentical(item["prints"]?.BS?.length, 1);
  });

  it("refuses a value that is not a set", async () => {
    // Given an article tagged once.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { tags: { SS: ["news"] } });

    // When a DELETE carries a plain string.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "DELETE tags :gone",
      ExpressionAttributeValues: { ":gone": { S: "news" } },
    });

    // Then it is refused, since DELETE is set subtraction and nothing else.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "operator: DELETE, operand type: S");
  });

  it("refuses a set of a different kind to the stored one", async () => {
    // Given an article tagged with strings.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { tags: { SS: ["news"] } });

    // When a DELETE carries a number set.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "DELETE tags :gone",
      ExpressionAttributeValues: { ":gone": { NS: ["1"] } },
    });

    // Then it is refused rather than taking nothing away.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "DELETE cannot apply a NS to the SS");
  });

  it("refuses an empty set", async () => {
    // Given an article tagged once.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, { tags: { SS: ["news"] } });

    // When a DELETE carries a set with no members in it.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "DELETE tags :gone",
      ExpressionAttributeValues: { ":gone": { SS: [] } },
    });

    // Then it is refused where the value is read, as DynamoDB has no empty set.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "set may not be empty");
  });

  it("refuses a document path inside another attribute", async () => {
    // Given an article carrying a map of sets.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws, {
      facets: { M: { tags: { SS: ["news"] } } },
    });

    // When a DELETE names something inside it.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "DELETE facets.tags :gone",
      ExpressionAttributeValues: { ":gone": { SS: ["news"] } },
    });

    // Then it is refused, as DELETE works on a top-level attribute on AWS too.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "DELETE works on an attribute of the item",
    );
  });
});

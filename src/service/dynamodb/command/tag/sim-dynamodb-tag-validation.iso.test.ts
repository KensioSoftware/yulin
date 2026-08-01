import {
  CreateTableCommand,
  ListTagsOfResourceCommand,
  TagResourceCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";
import type { SimDynamoDbTagInput } from "../table/table.types.js";

/**
 * The error tagging a table with these tags is refused with.
 */
async function refusedTags(
  tags: readonly SimDynamoDbTagInput[],
): Promise<Error> {
  const simAws = new SimAws();
  const table = await simDynamoDbCreatedTableFactory.make(
    { tableName: "OrdersTable", partitionKeyName: "orderId" },
    simAws,
  );

  return await assertThrowsErrorAsync(async () =>
    simAws
      .dynamoDb()
      .tagResource({ input: { ResourceArn: table.arn, Tags: tags } }),
  );
}

describe("DynamoDB tag validation", () => {
  it("requires a key", async () => {
    // When a tag carries no key.
    const error = await refusedTags([{ Value: "test" }]);

    // Then it is refused, since a tag is held under its key.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "A Tag requires a Key of at least one character",
    );
  });

  it("requires a value", async () => {
    // When a tag carries no value.
    const error = await refusedTags([{ Key: "Environment" }]);

    // Then it is refused, though an empty value would have been taken.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The tag 'Environment' requires a Value",
    );
  });

  it("refuses a key longer than a tag key holds", async () => {
    // When a key of 129 characters is used.
    const error = await refusedTags([{ Key: "e".repeat(129), Value: "test" }]);

    // Then it is refused with the length named.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "is 129 characters, where 128 is the most a tag key holds",
    );
  });

  it("refuses a value longer than a tag value holds", async () => {
    // When a value of 257 characters is used.
    const error = await refusedTags([
      { Key: "Environment", Value: "t".repeat(257) },
    ]);

    // Then it is refused with the length named.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "is 257 characters, where 256 is the most a tag value holds",
    );
  });

  it("refuses a key with a character a tag is not written with", async () => {
    // When a key carries an @, which DynamoDB does not take even though some
    // other AWS services do.
    const error = await refusedTags([{ Key: "owner@team", Value: "test" }]);

    // Then it is refused, naming what a tag is written with.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Tag key 'owner@team' has a character a tag does not take",
    );
  });

  it("refuses a value with a character a tag is not written with", async () => {
    // When a value carries a comma.
    const error = await refusedTags([
      { Key: "Environment", Value: "test,staging" },
    ]);

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The value of the tag 'Environment' has a character a tag does not take",
    );
  });

  it("takes the punctuation a tag is written with", async () => {
    // Given a table.
    const simAws = new SimAws();
    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When a tag uses every character DynamoDB allows beyond letters and
    // digits.
    await simAws.dynamoDb().tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: [{ Key: "cost centre/team_1", Value: "a+b-c=d.e_f:g/h 1" }],
      }),
    );

    // Then it is taken.
    const output = await simAws
      .dynamoDb()
      .listTagsOfResource(
        new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
      );
    assertArrayLength(output.Tags, 1);
    assertObjectEquals(output.Tags[0], {
      Key: "cost centre/team_1",
      Value: "a+b-c=d.e_f:g/h 1",
    });
  });

  it("refuses a key under the reserved aws: prefix", async () => {
    // When a key AWS assigns to itself is used.
    const error = await refusedTags([
      { Key: "aws:cloudformation:stack-name", Value: "TestStack" },
    ]);

    // Then it is refused rather than held alongside the tags AWS assigns.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "begins with the reserved aws: prefix");
  });

  it("refuses more tags than a resource holds", async () => {
    // When 51 tags are applied at once.
    const error = await refusedTags(
      Array.from({ length: 51 }, (_unused, index) => ({
        Key: `Tag${String(index)}`,
        Value: "test",
      })),
    );

    // Then it is refused for the count, saying what it would have left.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "A DynamoDB resource holds 50 tags, and this request would leave it " +
        "holding 51",
    );
  });

  it("counts the tags already there towards the limit", async () => {
    // Given a table holding 50 tags.
    const simAws = new SimAws();
    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    await simAws.dynamoDb().tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: Array.from({ length: 50 }, (_unused, index) => ({
          Key: `Tag${String(index)}`,
          Value: "test",
        })),
      }),
    );

    // When one more key is added.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().tagResource(
        new TagResourceCommand({
          ResourceArn: table.arn,
          Tags: [{ Key: "OneTooMany", Value: "test" }],
        }),
      ),
    );

    // Then it is refused, and replacing one of the 50 would have been fine.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "would leave it holding 51");
  });

  it("leaves the tags as they were when a request is refused", async () => {
    // Given a tagged table.
    const simAws = new SimAws();
    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    await simAws.dynamoDb().tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: [{ Key: "Environment", Value: "test" }],
      }),
    );

    // When a request carrying a good tag and a bad one is made.
    await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().tagResource(
        new TagResourceCommand({
          ResourceArn: table.arn,
          Tags: [
            { Key: "Owner", Value: "platform" },
            { Key: "Environment", Value: "test,staging" },
          ],
        }),
      ),
    );

    // Then neither was applied: the whole request is read before any of it is
    // kept.
    const output = await simAws
      .dynamoDb()
      .listTagsOfResource(
        new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
      );
    assertArrayLength(output.Tags, 1);
    assertObjectEquals(output.Tags[0], { Key: "Environment", Value: "test" });
  });

  it("refuses the table when CreateTable carries a bad tag", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table is created with a tag DynamoDB would refuse.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().createTable(
        new CreateTableCommand({
          TableName: "OrdersTable",
          KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
          AttributeDefinitions: [
            { AttributeName: "orderId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
          Tags: [{ Key: "aws:owner", Value: "platform" }],
        }),
      ),
    );

    // Then no table was created, since the tags are checked before the name is
    // taken.
    assertInstanceOf(error, SimDynamoDbValidationException);

    const listed = await simAws.dynamoDb().listTables({ input: {} });
    assertArrayLength(listed.TableNames, 0);
  });
});

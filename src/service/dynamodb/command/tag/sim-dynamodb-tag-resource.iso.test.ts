import {
  CreateTableCommand,
  ListTagsOfResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

describe("DynamoDB resource tagging", () => {
  it("keeps the tags CreateTable was given", async () => {
    // Given a table created with tags.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const creation = await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "OrdersTable",
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        Tags: [
          { Key: "Environment", Value: "test" },
          { Key: "Owner", Value: "platform" },
        ],
      }),
    );
    await simAws.backgroundTasksComplete();

    const tableArn = creation.TableDescription?.TableArn;
    assertNonNullable(tableArn);

    // When the tags are listed off it.
    const output = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: tableArn }),
    );

    // Then both are there, and there is no page left to read.
    assertArrayLength(output.Tags, 2);
    assertObjectEquals(output.Tags[0], { Key: "Environment", Value: "test" });
    assertObjectEquals(output.Tags[1], { Key: "Owner", Value: "platform" });
    assertUndefined(output.NextToken);
  });

  it("adds tags to a table that was created without any", async () => {
    // Given an untagged table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When it is tagged.
    await simDynamoDb.tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: [{ Key: "Environment", Value: "test" }],
      }),
    );

    // Then the tag is on it.
    const output = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
    );
    assertArrayLength(output.Tags, 1);
    assertObjectEquals(output.Tags[0], { Key: "Environment", Value: "test" });
  });

  it("replaces the value of a key that is already there", async () => {
    // Given a table tagged with an environment.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    await simDynamoDb.tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: [{ Key: "Environment", Value: "test" }],
      }),
    );

    // When the same key is tagged again with another value.
    await simDynamoDb.tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: [{ Key: "Environment", Value: "staging" }],
      }),
    );

    // Then the value changed rather than a second entry appearing.
    const output = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
    );
    assertArrayLength(output.Tags, 1);
    assertObjectEquals(output.Tags[0], {
      Key: "Environment",
      Value: "staging",
    });
  });

  it("takes the keys UntagResource names off", async () => {
    // Given a table with three tags.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    await simDynamoDb.tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: [
          { Key: "Environment", Value: "test" },
          { Key: "Owner", Value: "platform" },
          { Key: "Project", Value: "ledger" },
        ],
      }),
    );

    // When two of them are taken off, along with a key that was never there.
    await simDynamoDb.untagResource(
      new UntagResourceCommand({
        ResourceArn: table.arn,
        TagKeys: ["Environment", "Project", "NeverThere"],
      }),
    );

    // Then the rest is left, and the key that was not there was not an error.
    const output = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
    );
    assertArrayLength(output.Tags, 1);
    assertObjectEquals(output.Tags[0], { Key: "Owner", Value: "platform" });
  });

  it("lists nothing for a table that was never tagged", async () => {
    // Given an untagged table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When its tags are listed.
    const output = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
    );

    // Then it answers with an empty list rather than refusing.
    assertArrayLength(output.Tags, 0);
    assertUndefined(output.NextToken);
  });

  it("takes a tag with an empty value", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When it is tagged with a key that says nothing about itself.
    await simDynamoDb.tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: [{ Key: "Temporary", Value: "" }],
      }),
    );

    // Then the tag is there, since a tag value may be empty where a key may
    // not.
    const output = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
    );
    assertIdentical(output.Tags[0]?.Value, "");
  });

  it("keeps the tags of two tables apart", async () => {
    // Given two tables.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const orders = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );
    const customers = await simDynamoDbCreatedTableFactory.make(
      { tableName: "CustomersTable", partitionKeyName: "customerId" },
      simAws,
    );

    // When one of them is tagged.
    await simDynamoDb.tagResource(
      new TagResourceCommand({
        ResourceArn: orders.arn,
        Tags: [{ Key: "Environment", Value: "test" }],
      }),
    );

    // Then the other is untouched.
    const output = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: customers.arn }),
    );
    assertArrayLength(output.Tags, 0);
  });
});

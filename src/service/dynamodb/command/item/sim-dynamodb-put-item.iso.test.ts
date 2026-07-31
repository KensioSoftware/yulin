import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * A table with one string partition key, ready to be written to.
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

describe("DynamoDB PutItemCommand", () => {
  it("writes an item and answers with nothing", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an item is written without asking for anything back.
    const output = await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-1" }, counter: { N: "1" } },
      }),
    );

    // Then no attributes come back, as real DynamoDB answers a plain put.
    assertUndefined(output.Attributes);
  });

  it("holds the item by the time the write returns", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an item is written and immediately replaced, with no wait on the
    // background scheduler in between.
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-1" }, note: { S: "written" } },
      }),
    );
    const output = await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { userId: { S: "user-1" }, note: { S: "replacing" } },
        ReturnValues: "ALL_OLD",
      }),
    );

    // Then the first write was already there to replace.
    assertIdentical(output.Attributes?.["note"]?.S, "written");
  });
});

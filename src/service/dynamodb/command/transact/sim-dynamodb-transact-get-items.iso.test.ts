import {
  PutItemCommand,
  TransactGetItemsCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

describe("DynamoDB TransactGetItemsCommand", () => {
  it("reads items from two tables in one call", async () => {
    // Given an account and a ledger entry.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "AccountsTable", partitionKeyName: "accountId" },
      simAws,
    );
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "AccountsTable",
        Item: { accountId: { S: "account-1" }, balance: { N: "100" } },
      }),
    );
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "LedgerTable",
        Item: { entryId: { S: "entry-1" }, amount: { N: "25" } },
      }),
    );

    // When one transactional read asks for both.
    const output = await simDynamoDb.transactGetItems(
      new TransactGetItemsCommand({
        TransactItems: [
          {
            Get: {
              TableName: "AccountsTable",
              Key: { accountId: { S: "account-1" } },
            },
          },
          {
            Get: {
              TableName: "LedgerTable",
              Key: { entryId: { S: "entry-1" } },
            },
          },
        ],
      }),
    );

    // Then the answers are in the order the Gets were named.
    assertArrayLength(output.Responses, 2);
    assertIdentical(output.Responses[0].Item?.["balance"]?.N, "100");
    assertIdentical(output.Responses[1].Item?.["amount"]?.N, "25");
  });

  it("answers a key that holds nothing with an entry carrying no Item", async () => {
    // Given an account and a ledger entry.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "AccountsTable", partitionKeyName: "accountId" },
      simAws,
    );
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "AccountsTable",
        Item: { accountId: { S: "account-1" }, balance: { N: "100" } },
      }),
    );
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "LedgerTable",
        Item: { entryId: { S: "entry-1" }, amount: { N: "25" } },
      }),
    );

    // When a read asks for a key nothing was written under, between two that
    // hold something.
    const output = await simDynamoDb.transactGetItems(
      new TransactGetItemsCommand({
        TransactItems: [
          {
            Get: {
              TableName: "AccountsTable",
              Key: { accountId: { S: "account-1" } },
            },
          },
          {
            Get: {
              TableName: "AccountsTable",
              Key: { accountId: { S: "account-404" } },
            },
          },
          {
            Get: {
              TableName: "LedgerTable",
              Key: { entryId: { S: "entry-1" } },
            },
          },
        ],
      }),
    );

    // Then the answers are never compacted, so the ones that were there are
    // still where the request put them.
    assertArrayLength(output.Responses, 3);
    assertUndefined(output.Responses[1].Item);
    assertObjectEquals(output.Responses[1], {});
    assertIdentical(output.Responses[2].Item?.["amount"]?.N, "25");
  });

  it("projects the attributes one Get asks for", async () => {
    // Given an account holding three attributes.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "AccountsTable", partitionKeyName: "accountId" },
      simAws,
    );

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "AccountsTable",
        Item: {
          accountId: { S: "account-1" },
          balance: { N: "100" },
          status: { S: "open" },
        },
      }),
    );

    // When one Get names a ProjectionExpression.
    const output = await simDynamoDb.transactGetItems(
      new TransactGetItemsCommand({
        TransactItems: [
          {
            Get: {
              TableName: "AccountsTable",
              Key: { accountId: { S: "account-1" } },
              ProjectionExpression: "balance, #status",
              ExpressionAttributeNames: { "#status": "status" },
            },
          },
        ],
      }),
    );

    // Then it answers with those attributes and nothing else.
    assertArrayLength(output.Responses, 1);
    assertObjectEquals(output.Responses[0].Item, {
      balance: { N: "100" },
      status: { S: "open" },
    });
  });

  it("reads a table named by its ARN", async () => {
    // Given a table holding an entry.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "LedgerTable",
        Item: { entryId: { S: "entry-1" } },
      }),
    );

    // When a transactional read names the table by its ARN.
    const output = await simDynamoDb.transactGetItems(
      new TransactGetItemsCommand({
        TransactItems: [
          {
            Get: {
              TableName: table.arn,
              Key: { entryId: { S: "entry-1" } },
            },
          },
        ],
      }),
    );

    // Then it is the same table.
    assertArrayLength(output.Responses, 1);
    assertIdentical(output.Responses[0].Item?.["entryId"]?.S, "entry-1");
  });
});

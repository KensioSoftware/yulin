import {
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

describe("DynamoDB TransactWriteItemsCommand", () => {
  it("writes a ledger entry and the balance it moves in one call", async () => {
    // Given an account holding a balance, and a ledger to record it in.
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

    // When one transaction writes the entry and moves the balance.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: "LedgerTable",
              Item: { entryId: { S: "entry-1" }, amount: { N: "25" } },
            },
          },
          {
            Update: {
              TableName: "AccountsTable",
              Key: { accountId: { S: "account-1" } },
              UpdateExpression: "SET balance = balance - :amount",
              ExpressionAttributeValues: { ":amount": { N: "25" } },
            },
          },
        ],
      }),
    );

    // Then both landed.
    const entry = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-1" } },
      }),
    );
    assertIdentical(entry.Item?.["amount"]?.N, "25");

    const account = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "AccountsTable",
        Key: { accountId: { S: "account-1" } },
      }),
    );
    assertIdentical(account.Item?.["balance"]?.N, "75");
  });

  it("deletes one item and puts another in one call", async () => {
    // Given a ledger entry, and an account holding nothing yet.
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
        TableName: "LedgerTable",
        Item: { entryId: { S: "entry-1" } },
      }),
    );

    // When one transaction deletes the entry and writes the account.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Delete: {
              TableName: "LedgerTable",
              Key: { entryId: { S: "entry-1" } },
            },
          },
          {
            Put: {
              TableName: "AccountsTable",
              Item: { accountId: { S: "account-1" }, balance: { N: "0" } },
            },
          },
        ],
      }),
    );

    // Then the entry is gone and the account is there.
    const entry = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-1" } },
      }),
    );
    assertUndefined(entry.Item);

    const account = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "AccountsTable",
        Key: { accountId: { S: "account-1" } },
      }),
    );
    assertIdentical(account.Item?.["balance"]?.N, "0");
  });

  it("deletes a key that holds nothing", async () => {
    // Given a table holding no items.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a transaction deletes a key nothing was written under.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Delete: {
              TableName: "LedgerTable",
              Key: { entryId: { S: "entry-1" } },
            },
          },
        ],
      }),
    );

    // Then it succeeds, as a delete names a key rather than an item.
    const entry = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-1" } },
      }),
    );
    assertUndefined(entry.Item);
  });

  it("writes when a ConditionCheck on another item holds", async () => {
    // Given an open account, and a ledger to write against it.
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
        Item: { accountId: { S: "account-1" }, status: { S: "open" } },
      }),
    );

    // When a transaction checks the account and writes an entry against it.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: "AccountsTable",
              Key: { accountId: { S: "account-1" } },
              ConditionExpression: "#status = :open",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: { ":open": { S: "open" } },
            },
          },
          {
            Put: {
              TableName: "LedgerTable",
              Item: { entryId: { S: "entry-1" } },
            },
          },
        ],
      }),
    );

    // Then the entry is written, and the account the check named is unchanged.
    const entry = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-1" } },
      }),
    );
    assertIdentical(entry.Item?.["entryId"]?.S, "entry-1");

    const account = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "AccountsTable",
        Key: { accountId: { S: "account-1" } },
      }),
    );
    assertIdentical(account.Item?.["status"]?.S, "open");
  });

  it("upserts an item an Update names when the key holds nothing", async () => {
    // Given a table holding no items.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "AccountsTable", partitionKeyName: "accountId" },
      simAws,
    );

    // When a transactional update names a key nothing is stored under.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Update: {
              TableName: "AccountsTable",
              Key: { accountId: { S: "account-1" } },
              UpdateExpression: "SET balance = :opening",
              ExpressionAttributeValues: { ":opening": { N: "10" } },
            },
          },
        ],
      }),
    );

    // Then the item is built from the Key and what the update set, as
    // UpdateItem builds it.
    const account = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "AccountsTable",
        Key: { accountId: { S: "account-1" } },
      }),
    );
    assertIdentical(account.Item?.["accountId"]?.S, "account-1");
    assertIdentical(account.Item["balance"]?.N, "10");
  });

  it("names one table for several of its items", async () => {
    // Given a table holding no items.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a transaction writes two items of the same table.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: "LedgerTable",
              Item: { entryId: { S: "entry-1" } },
            },
          },
          {
            Put: {
              TableName: "LedgerTable",
              Item: { entryId: { S: "entry-2" } },
            },
          },
        ],
      }),
    );

    // Then both are there. A transaction names one table as often as it likes,
    // where a batch names it once.
    const second = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-2" } },
      }),
    );
    assertIdentical(second.Item?.["entryId"]?.S, "entry-2");
  });

  it("writes to a table named by its ARN", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a transaction names the table by its ARN.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: { TableName: table.arn, Item: { entryId: { S: "entry-1" } } },
          },
        ],
      }),
    );

    // Then it is the same table.
    const entry = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-1" } },
      }),
    );
    assertIdentical(entry.Item?.["entryId"]?.S, "entry-1");
  });

  it("takes the 100 actions a transaction holds", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a transaction writes exactly 100 items.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: Array.from({ length: 100 }, (_unused, index) => ({
          Put: {
            TableName: "LedgerTable",
            Item: { entryId: { S: `entry-${String(index)}` } },
          },
        })),
      }),
    );

    // Then all of them are there.
    const last = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-99" } },
      }),
    );
    assertIdentical(last.Item?.["entryId"]?.S, "entry-99");
  });
});

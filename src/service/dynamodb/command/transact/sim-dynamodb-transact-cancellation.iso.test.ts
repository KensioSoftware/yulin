import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbTransactionCanceledException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * A ledger and the account balances its entries move, as two tables.
 */
async function ledgerTables(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDb.createTable(
    new CreateTableCommand({
      TableName: "AccountsTable",
      KeySchema: [{ AttributeName: "accountId", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "accountId", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simDynamoDb.createTable(
    new CreateTableCommand({
      TableName: "LedgerTable",
      KeySchema: [{ AttributeName: "entryId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "entryId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.backgroundTasksComplete();

  return simDynamoDb;
}

/**
 * A closed account, which the conditions these tests write are about.
 */
async function closedAccount(simDynamoDb: SimDynamoDb): Promise<void> {
  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "AccountsTable",
      Item: { accountId: { S: "account-1" }, status: { S: "closed" } },
    }),
  );
}

/**
 * A ledger entry, and an update that only moves an open account's balance.
 */
const ledgerEntry = {
  Put: {
    TableName: "LedgerTable",
    Item: { entryId: { S: "entry-1" }, amount: { N: "25" } },
  },
};

const balanceUpdate = {
  Update: {
    TableName: "AccountsTable",
    Key: { accountId: { S: "account-1" } },
    UpdateExpression: "SET balance = :moved",
    ConditionExpression: "#status = :open",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":moved": { N: "25" },
      ":open": { S: "open" },
    },
  },
};

describe("DynamoDB transactional write cancellation", () => {
  it("reports every action, including the one nothing was wrong with", async () => {
    // Given a closed account.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    await closedAccount(simDynamoDb);

    // When a transaction writes an entry and moves the balance of it.
    const cancelled = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [ledgerEntry, balanceUpdate],
        }),
      ),
    );

    // Then the reasons line up with the actions, and the first one is reported
    // even though nothing was wrong with it.
    assertInstanceOf(cancelled, SimDynamoDbTransactionCanceledException);
    const reasons = cancelled.CancellationReasons;
    assertArrayLength(reasons, 2);
    assertObjectEquals(reasons[0], { Code: "None" });
    assertObjectEquals(reasons[1], {
      Code: "ConditionalCheckFailed",
      Message: "The conditional request failed.",
    });
    assertIdentical(
      cancelled.message,
      "Transaction cancelled, please refer cancellation reasons for " +
        "specific reasons [None, ConditionalCheckFailed]",
    );
  });

  it("leaves the action that would have gone through unwritten", async () => {
    // Given a closed account.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    await closedAccount(simDynamoDb);

    // When the transaction is cancelled.
    await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [ledgerEntry, balanceUpdate],
        }),
      ),
    );

    // Then neither item was written.
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
    assertUndefined(account.Item?.["balance"]);
  });

  it("puts the item on the reason for ALL_OLD", async () => {
    // Given a closed account.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    await closedAccount(simDynamoDb);

    // When the action that fails asked for the item it lost to.
    const cancelled = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: "AccountsTable",
                Key: { accountId: { S: "account-1" } },
                ConditionExpression: "#status = :open",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: { ":open": { S: "open" } },
                ReturnValuesOnConditionCheckFailure: "ALL_OLD",
              },
            },
          ],
        }),
      ),
    );

    // Then the reason carries the item as it was, so a retry needs no second
    // read.
    assertInstanceOf(cancelled, SimDynamoDbTransactionCanceledException);
    const reasons = cancelled.CancellationReasons;
    assertArrayLength(reasons, 1);
    assertObjectEquals(reasons[0], {
      Code: "ConditionalCheckFailed",
      Message: "The conditional request failed.",
      Item: { accountId: { S: "account-1" }, status: { S: "closed" } },
    });
  });

  it("leaves the item off the reason when the key holds nothing", async () => {
    // Given a table holding no items.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    // When an action asking for ALL_OLD fails against a key holding nothing.
    const cancelled = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Delete: {
                TableName: "AccountsTable",
                Key: { accountId: { S: "account-1" } },
                ConditionExpression: "attribute_exists(accountId)",
                ReturnValuesOnConditionCheckFailure: "ALL_OLD",
              },
            },
          ],
        }),
      ),
    );

    // Then there is no item to report, so the reason carries none.
    assertInstanceOf(cancelled, SimDynamoDbTransactionCanceledException);
    const reasons = cancelled.CancellationReasons;
    assertArrayLength(reasons, 1);
    assertObjectEquals(reasons[0], {
      Code: "ConditionalCheckFailed",
      Message: "The conditional request failed.",
    });
  });

  it("reports every action whose condition failed", async () => {
    // Given a closed account and a ledger entry that is already there.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    await closedAccount(simDynamoDb);
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "LedgerTable",
        Item: { entryId: { S: "entry-1" } },
      }),
    );

    // When both actions of a transaction are guarded by a condition that does
    // not hold.
    const cancelled = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: "LedgerTable",
                Item: { entryId: { S: "entry-1" } },
                ConditionExpression: "attribute_not_exists(entryId)",
              },
            },
            balanceUpdate,
          ],
        }),
      ),
    );

    // Then neither is reported as fine, since checking stops at nothing.
    assertInstanceOf(cancelled, SimDynamoDbTransactionCanceledException);
    const reasons = cancelled.CancellationReasons;
    assertArrayLength(reasons, 2);
    assertObjectEquals(reasons[0], {
      Code: "ConditionalCheckFailed",
      Message: "The conditional request failed.",
    });
    assertObjectEquals(reasons[1], {
      Code: "ConditionalCheckFailed",
      Message: "The conditional request failed.",
    });
  });

  it("cancels a transaction a Put's own condition turns away", async () => {
    // Given a ledger entry that is already there.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "LedgerTable",
        Item: { entryId: { S: "entry-1" }, amount: { N: "10" } },
      }),
    );

    // When a transaction tries to insert it again.
    const cancelled = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: "LedgerTable",
                Item: { entryId: { S: "entry-1" }, amount: { N: "25" } },
                ConditionExpression: "attribute_not_exists(entryId)",
              },
            },
          ],
        }),
      ),
    );

    // Then the item is left exactly as it was.
    assertInstanceOf(cancelled, SimDynamoDbTransactionCanceledException);

    const entry = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-1" } },
      }),
    );
    assertIdentical(entry.Item?.["amount"]?.N, "10");
  });
});

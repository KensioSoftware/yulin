import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactGetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimDynamoDbTransactionCanceledException } from "../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../table/sim-dynamodb-created-table.factory.js";

/**
 * An intercepted document client, and the two tables these transactions span.
 *
 * A transaction is usually reached for when two items have to agree with each
 * other, and those two items are often in different tables.
 */
async function interceptedDocuments(
  simSdk: SimSdk,
): Promise<DynamoDBDocumentClient> {
  await simDynamoDbCreatedTableFactory.make(
    { tableName: "AccountsTable", partitionKeyName: "accountId" },
    simSdk.simAws,
  );
  await simDynamoDbCreatedTableFactory.make(
    { tableName: "LedgerTable", partitionKeyName: "entryId" },
    simSdk.simAws,
  );

  // The tables the factory made are in the simulated default Region, so the
  // client works there too.
  const documents = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: simSdk.simAws.defaultRegionName }),
  );
  simSdk.intercept(documents);

  return documents;
}

/**
 * Read one account back as plain JavaScript.
 */
async function readAccount(
  documents: DynamoDBDocumentClient,
  accountId: string,
): Promise<Record<string, unknown> | undefined> {
  const read = await documents.send(
    new GetCommand({ TableName: "AccountsTable", Key: { accountId } }),
  );

  return read.Item;
}

describe("simulated DynamoDB document client transactions", () => {
  it("applies a put, an update, a delete and a condition check together", async () => {
    // Given an open account, another account to move, and a ledger entry to
    // replace.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    await documents.send(
      new PutCommand({
        TableName: "AccountsTable",
        Item: { accountId: "account-1", balance: 100, status: "open" },
      }),
    );
    await documents.send(
      new PutCommand({
        TableName: "AccountsTable",
        Item: { accountId: "account-2", status: "open" },
      }),
    );
    await documents.send(
      new PutCommand({
        TableName: "LedgerTable",
        Item: { entryId: "entry-1", amount: 25 },
      }),
    );

    // When one transaction writes an entry, moves a balance, removes the old
    // entry and checks the account it is leaving alone, all in plain
    // JavaScript.
    await documents.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: "LedgerTable",
              Item: { entryId: "entry-2", amount: 75, lines: [{ sku: "a" }] },
            },
          },
          {
            Update: {
              TableName: "AccountsTable",
              Key: { accountId: "account-1" },
              UpdateExpression: "SET balance = :balance",
              ConditionExpression: "#status = :open",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: { ":balance": 75, ":open": "open" },
            },
          },
          {
            Delete: {
              TableName: "LedgerTable",
              Key: { entryId: "entry-1" },
            },
          },
          {
            ConditionCheck: {
              TableName: "AccountsTable",
              Key: { accountId: "account-2" },
              ConditionExpression: "#status = :open",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: { ":open": "open" },
            },
          },
        ],
      }),
    );

    // Then every action happened, and what each wrote reads back native.
    assertObjectEquals(await readAccount(documents, "account-1"), {
      accountId: "account-1",
      balance: 75,
      status: "open",
    });

    const entries = await documents.send(
      new TransactGetCommand({
        TransactItems: [
          { Get: { TableName: "LedgerTable", Key: { entryId: "entry-1" } } },
          { Get: { TableName: "LedgerTable", Key: { entryId: "entry-2" } } },
        ],
      }),
    );
    const responses = entries.Responses;
    assertNonNullable(responses);
    assertArrayLength(responses, 2);
    assertObjectEquals(responses[0], {});
    assertObjectEquals(responses[1].Item, {
      entryId: "entry-2",
      amount: 75,
      lines: [{ sku: "a" }],
    });
  });

  it("cancels the whole transaction when one condition is refused", async () => {
    // Given a closed account.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    await documents.send(
      new PutCommand({
        TableName: "AccountsTable",
        Item: { accountId: "account-1", balance: 100, status: "closed" },
      }),
    );

    // When a transaction writes a ledger entry and moves the balance of it.
    const cancelled = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: "LedgerTable",
                Item: { entryId: "entry-1", amount: 25 },
              },
            },
            {
              Update: {
                TableName: "AccountsTable",
                Key: { accountId: "account-1" },
                UpdateExpression: "SET balance = :balance",
                ConditionExpression: "#status = :open",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: { ":balance": 75, ":open": "open" },
              },
            },
          ],
        }),
      );
    });

    // Then the reasons line up with the actions the request named, the same
    // way the low-level Command reports them.
    assertInstanceOf(cancelled, SimDynamoDbTransactionCanceledException);
    assertArrayLength(cancelled.CancellationReasons, 2);
    assertObjectEquals(cancelled.CancellationReasons[0], { Code: "None" });
    assertIdentical(
      cancelled.CancellationReasons[1].Code,
      "ConditionalCheckFailed",
    );

    // And neither action was applied.
    const entry = await documents.send(
      new GetCommand({ TableName: "LedgerTable", Key: { entryId: "entry-1" } }),
    );
    assertUndefined(entry.Item);
    assertObjectEquals(await readAccount(documents, "account-1"), {
      accountId: "account-1",
      balance: 100,
      status: "closed",
    });
  });

  it("reports the item of a cancellation reason as the low-level Command does", async () => {
    // Given a closed account the transaction asks to see on failure.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    await documents.send(
      new PutCommand({
        TableName: "AccountsTable",
        Item: { accountId: "account-1", balance: 100, status: "closed" },
      }),
    );

    // When its condition is refused.
    const cancelled = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: "AccountsTable",
                Key: { accountId: "account-1" },
                ConditionExpression: "#status = :open",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: { ":open": "open" },
                ReturnValuesOnConditionCheckFailure: "ALL_OLD",
              },
            },
          ],
        }),
      );
    });

    // Then the item on the reason carries descriptors. A cancelled transaction
    // is thrown, and the real document client converts nothing on the way out
    // of a transactional write.
    assertInstanceOf(cancelled, SimDynamoDbTransactionCanceledException);
    assertArrayLength(cancelled.CancellationReasons, 1);
    assertObjectEquals(cancelled.CancellationReasons[0].Item, {
      accountId: { S: "account-1" },
      balance: { N: "100" },
      status: { S: "closed" },
    });
  });

  it("projects a transactional read and answers with native values", async () => {
    // Given an account holding more than the read asks for.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    await documents.send(
      new PutCommand({
        TableName: "AccountsTable",
        Item: {
          accountId: "account-1",
          balance: 100,
          tags: new Set(["priority"]),
        },
      }),
    );

    // When only one attribute is projected.
    const read = await documents.send(
      new TransactGetCommand({
        TransactItems: [
          {
            Get: {
              TableName: "AccountsTable",
              Key: { accountId: "account-1" },
              ProjectionExpression: "balance",
            },
          },
        ],
      }),
    );

    // Then that attribute comes back native.
    const responses = read.Responses;
    assertNonNullable(responses);
    assertArrayLength(responses, 1);
    assertObjectEquals(responses[0].Item, { balance: 100 });
  });
});

import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbIdempotentParameterMismatchException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * An account holding a balance of 100.
 */
async function accountWithBalance(simAws: SimAws): Promise<SimDynamoDb> {
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
  await simAws.backgroundTasksComplete();

  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "AccountsTable",
      Item: { accountId: { S: "account-1" }, balance: { N: "100" } },
    }),
  );

  return simDynamoDb;
}

/**
 * The balance the account is currently holding.
 */
async function balanceOf(
  simDynamoDb: SimDynamoDb,
): Promise<string | undefined> {
  const output = await simDynamoDb.getItem(
    new GetItemCommand({
      TableName: "AccountsTable",
      Key: { accountId: { S: "account-1" } },
    }),
  );

  return output.Item?.["balance"]?.N;
}

/**
 * A transaction that takes 25 off the balance.
 */
const withdrawal = {
  TransactItems: [
    {
      Update: {
        TableName: "AccountsTable",
        Key: { accountId: { S: "account-1" } },
        UpdateExpression: "SET balance = balance - :amount",
        ExpressionAttributeValues: { ":amount": { N: "25" } },
      },
    },
  ],
  ClientRequestToken: "6b6b1a1e-0e2d-4d3f-9f5a-1c0f2b3d4e5f",
};

describe("DynamoDB transactional write idempotency", () => {
  it("does not apply the writes again for the same token and payload", async () => {
    // Given an account that has already had a withdrawal applied to it.
    const simAws = new SimAws();
    const simDynamoDb = await accountWithBalance(simAws);

    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand(withdrawal),
    );

    // When the same call is retried under the same token.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand(withdrawal),
    );

    // Then the balance moved once, as the retry was the same request rather
    // than a second one.
    assertIdentical(await balanceOf(simDynamoDb), "75");
  });

  it("refuses a token replayed with a different payload", async () => {
    // Given an account that has already had a withdrawal applied to it.
    const simAws = new SimAws();
    const simDynamoDb = await accountWithBalance(simAws);

    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand(withdrawal),
    );

    // When the same token is used for a different transaction.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Update: {
                TableName: "AccountsTable",
                Key: { accountId: { S: "account-1" } },
                UpdateExpression: "SET balance = balance - :amount",
                ExpressionAttributeValues: { ":amount": { N: "50" } },
              },
            },
          ],
          ClientRequestToken: withdrawal.ClientRequestToken,
        }),
      ),
    );

    // Then it is refused, and the balance is left where the first call put it.
    assertInstanceOf(error, SimDynamoDbIdempotentParameterMismatchException);
    assertIdentical(await balanceOf(simDynamoDb), "75");
  });

  it("applies the writes again once the token window has passed", async () => {
    // Given an account that has already had a withdrawal applied to it.
    const simAws = new SimAws();
    const simDynamoDb = await accountWithBalance(simAws);

    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand(withdrawal),
    );

    // When ten simulated minutes pass and the same call is made again.
    await simAws.clock().advanceBy({ minutes: 10 });
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand(withdrawal),
    );

    // Then it is a new transaction rather than a retry of the old one.
    assertIdentical(await balanceOf(simDynamoDb), "50");
  });

  it("still treats a token inside the window as a retry", async () => {
    // Given an account that has already had a withdrawal applied to it.
    const simAws = new SimAws();
    const simDynamoDb = await accountWithBalance(simAws);

    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand(withdrawal),
    );

    // When nine simulated minutes pass and the same call is made again.
    await simAws.clock().advanceBy({ minutes: 9 });
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand(withdrawal),
    );

    // Then the balance moved once.
    assertIdentical(await balanceOf(simDynamoDb), "75");
  });

  it("does not remember a transaction that was cancelled", async () => {
    // Given a transaction that was cancelled by its condition.
    const simAws = new SimAws();
    const simDynamoDb = await accountWithBalance(simAws);

    const guarded = {
      TransactItems: [
        {
          Put: {
            TableName: "AccountsTable",
            Item: { accountId: { S: "account-2" } },
            ConditionExpression: "attribute_exists(accountId)",
          },
        },
      ],
      ClientRequestToken: "e2f0a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b",
    };

    await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(new TransactWriteItemsCommand(guarded)),
    );

    // When the same token is used for a transaction that can be applied.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: "AccountsTable",
              Item: { accountId: { S: "account-2" } },
            },
          },
        ],
        ClientRequestToken: guarded.ClientRequestToken,
      }),
    );

    // Then it runs, since a transaction that was cancelled never happened.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "AccountsTable",
        Key: { accountId: { S: "account-2" } },
      }),
    );
    assertIdentical(output.Item?.["accountId"]?.S, "account-2");
  });

  it("refuses a ClientRequestToken of a length DynamoDB does not take", async () => {
    // Given an account.
    const simAws = new SimAws();
    const simDynamoDb = await accountWithBalance(simAws);

    // When a transaction carries an empty token.
    const empty = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          ...withdrawal,
          ClientRequestToken: "",
        }),
      ),
    );

    // And when it carries one of 37 characters.
    const long = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          ...withdrawal,
          ClientRequestToken: "x".repeat(37),
        }),
      ),
    );

    // Then both are refused, and nothing was written either time.
    assertInstanceOf(empty, SimDynamoDbValidationException);
    assertStringIncludes(empty.message, "ClientRequestToken has a length of 0");
    assertInstanceOf(long, SimDynamoDbValidationException);
    assertStringIncludes(long.message, "ClientRequestToken has a length of 37");
    assertIdentical(await balanceOf(simDynamoDb), "100");
  });

  it("applies each transaction that carries no token", async () => {
    // Given an account.
    const simAws = new SimAws();
    const simDynamoDb = await accountWithBalance(simAws);

    const untokened = {
      TransactItems: withdrawal.TransactItems,
    };

    // When the same transaction is made twice with no token.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand(untokened),
    );
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand(untokened),
    );

    // Then both are applied, since nothing said they were the same call.
    assertIdentical(await balanceOf(simDynamoDb), "50");
  });

  it("leaves a table alone when a mismatched token is refused", async () => {
    // Given an account with no second account beside it.
    const simAws = new SimAws();
    const simDynamoDb = await accountWithBalance(simAws);

    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand(withdrawal),
    );

    // When a mismatched replay asks for a write.
    await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: "AccountsTable",
                Item: { accountId: { S: "account-2" } },
              },
            },
          ],
          ClientRequestToken: withdrawal.ClientRequestToken,
        }),
      ),
    );

    // Then nothing was written.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "AccountsTable",
        Key: { accountId: { S: "account-2" } },
      }),
    );
    assertUndefined(output.Item);
  });
});

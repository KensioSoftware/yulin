import {
  CreateTableCommand,
  PutItemCommand,
  TransactGetItemsCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * An account and a ledger entry, in two tables.
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
  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "LedgerTable",
      Item: { entryId: { S: "entry-1" }, amount: { N: "25" } },
    }),
  );

  return simDynamoDb;
}

describe("DynamoDB TransactGetItemsCommand", () => {
  it("reads items from two tables in one call", async () => {
    // Given an account and a ledger entry.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

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
    const simDynamoDb = await ledgerTables(simAws);

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
    const simDynamoDb = await ledgerTables(simAws);

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
    assertObjectEquals(output.Responses[0]?.Item, {
      balance: { N: "100" },
      status: { S: "open" },
    });
  });

  it("reads a table named by its ARN", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const creation = await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "LedgerTable",
        KeySchema: [{ AttributeName: "entryId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "entryId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

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
              TableName: creation.TableDescription?.TableArn ?? "",
              Key: { entryId: { S: "entry-1" } },
            },
          },
        ],
      }),
    );

    // Then it is the same table.
    assertIdentical(output.Responses[0]?.Item?.["entryId"]?.S, "entry-1");
  });

  it("requires TransactItems naming a Get", async () => {
    // Given two tables.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    // When a transactional read asks for nothing.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactGetItems(
        new TransactGetItemsCommand({ TransactItems: [] }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "TransactGetItems requires TransactItems naming at least one action",
    );
  });

  it("requires TransactItems at all", async () => {
    // Given two tables.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    // When a transactional read names no Gets at all.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactGetItems({ input: {} }),
    );

    // Then it is refused the same way an empty list is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "TransactGetItems requires TransactItems naming at least one action",
    );
  });

  it("refuses more Gets than a transaction takes", async () => {
    // Given two tables.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    // When a transactional read asks for 101 items.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactGetItems(
        new TransactGetItemsCommand({
          TransactItems: Array.from({ length: 101 }, (_unused, index) => ({
            Get: {
              TableName: "LedgerTable",
              Key: { entryId: { S: `entry-${String(index)}` } },
            },
          })),
        }),
      ),
    );

    // Then it is refused before the Gets are read.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "101 actions, where 100 is the most a transaction takes",
    );
  });

  it("refuses an entry carrying no Get", async () => {
    // Given two tables.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    // When one entry names nothing to read.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactGetItems({ input: { TransactItems: [{}] } }),
    );

    // Then it is refused rather than read as an empty request.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A TransactGetItem carries a Get");
  });

  it("refuses two Gets of one item", async () => {
    // Given two tables.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    // When a transactional read asks for the same item twice.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactGetItems(
        new TransactGetItemsCommand({
          TransactItems: [
            {
              Get: {
                TableName: "LedgerTable",
                Key: { entryId: { S: "entry-1" } },
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
      ),
    );

    // Then the whole read is refused, as a transactional write naming one item
    // twice is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Transaction request cannot include multiple operations on one item",
    );
  });

  it("refuses a read naming a table that is not there", async () => {
    // Given two tables.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    // When one Get names a table that was never created.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactGetItems(
        new TransactGetItemsCommand({
          TransactItems: [
            {
              Get: {
                TableName: "ArchivedLedgerTable",
                Key: { entryId: { S: "entry-1" } },
              },
            },
          ],
        }),
      ),
    );

    // Then the whole read is refused.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });

  it("refuses the read reporting inputs this simulation does not model", async () => {
    // Given two tables.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTables(simAws);

    // When a transactional read asks for a capacity cost.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactGetItems(
        new TransactGetItemsCommand({
          TransactItems: [
            {
              Get: {
                TableName: "LedgerTable",
                Key: { entryId: { S: "entry-1" } },
              },
            },
          ],
          ReturnConsumedCapacity: "TOTAL",
        }),
      ),
    );

    // Then it is refused by name rather than reported on.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "ReturnConsumedCapacity");
  });
});

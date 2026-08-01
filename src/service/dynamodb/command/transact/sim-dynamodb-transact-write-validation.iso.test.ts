import {
  GetItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

const entryPut = {
  Put: { TableName: "LedgerTable", Item: { entryId: { S: "entry-1" } } },
};

describe("DynamoDB TransactWriteItemsCommand request validation", () => {
  it("requires TransactItems naming an action", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a transaction asks for nothing.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({ TransactItems: [] }),
      ),
    );

    // Then it is refused, since a transaction has to do something.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "TransactWriteItems requires TransactItems naming at least one action",
    );
  });

  it("requires TransactItems at all", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a transaction names no actions at all, under a token.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems({
        input: { ClientRequestToken: "a-token" },
      }),
    );

    // Then it is refused the same way an empty list is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "TransactWriteItems requires TransactItems naming at least one action",
    );
  });

  it("refuses more actions than a transaction takes", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a transaction asks for 101 actions.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: Array.from({ length: 101 }, (_unused, index) => ({
            Put: {
              TableName: "LedgerTable",
              Item: { entryId: { S: `entry-${String(index)}` } },
            },
          })),
        }),
      ),
    );

    // Then it is refused before the actions are read.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "101 actions, where 100 is the most a transaction takes",
    );
  });

  it("refuses an entry carrying two of the four actions", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When one entry asks for both a put and a delete.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: "LedgerTable",
                Item: { entryId: { S: "entry-1" } },
              },
              Delete: {
                TableName: "LedgerTable",
                Key: { entryId: { S: "entry-1" } },
              },
            },
          ],
        }),
      ),
    );

    // Then it is refused rather than one of the two being guessed at.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "this one carries Put and Delete");
  });

  it("refuses an entry carrying none of the four actions", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When one entry asks for nothing.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({ TransactItems: [{}] }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "this one carries none of them");
  });

  it("requires an Item on a Put", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a put carries no Item.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems({
        input: { TransactItems: [{ Put: { TableName: "LedgerTable" } }] },
      }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A Put requires an Item");
  });

  it("requires an UpdateExpression on an Update", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When an update says nothing to change.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems({
        input: {
          TransactItems: [
            {
              Update: {
                TableName: "LedgerTable",
                Key: { entryId: { S: "entry-1" } },
              },
            },
          ],
        },
      }),
    );

    // Then it is refused, where UpdateItem would take it as an upsert of the
    // Key.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "An Update requires an UpdateExpression",
    );
  });

  it("requires a ConditionExpression on a ConditionCheck", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a condition check names no condition.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems({
        input: {
          TransactItems: [
            {
              ConditionCheck: {
                TableName: "LedgerTable",
                Key: { entryId: { S: "entry-1" } },
              },
            },
          ],
        },
      }),
    );

    // Then it is refused, since checking nothing is not a check.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "A ConditionCheck requires a ConditionExpression",
    );
  });

  it("requires a Key on a Delete", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a delete carries no Key.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems({
        input: { TransactItems: [{ Delete: { TableName: "LedgerTable" } }] },
      }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A Key is required");
  });

  it("refuses two actions on one item of a table", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a transaction writes and deletes the same item.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            entryPut,
            {
              Delete: {
                TableName: "LedgerTable",
                Key: { entryId: { S: "entry-1" } },
              },
            },
          ],
        }),
      ),
    );

    // Then the whole transaction is refused, since which of the two applied
    // would be arbitrary.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Transaction request cannot include multiple operations on one item",
    );
  });

  it("refuses a transaction naming a table that is not there", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When one action names a table that was never created.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            entryPut,
            {
              Put: {
                TableName: "ArchivedLedgerTable",
                Item: { entryId: { S: "entry-2" } },
              },
            },
          ],
        }),
      ),
    );

    // Then the whole transaction is refused, and nothing is written.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);

    const entry = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-1" } },
      }),
    );
    assertUndefined(entry.Item);
  });

  it("refuses an update that would move the primary key", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When one action writes to a key attribute.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            entryPut,
            {
              Update: {
                TableName: "LedgerTable",
                Key: { entryId: { S: "entry-2" } },
                UpdateExpression: "SET entryId = :moved",
                ExpressionAttributeValues: { ":moved": { S: "entry-3" } },
              },
            },
          ],
        }),
      ),
    );

    // Then the request is refused rather than cancelled, and the action that
    // was fine is not written either.
    assertInstanceOf(error, SimDynamoDbValidationException);

    const entry = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-1" } },
      }),
    );
    assertUndefined(entry.Item);
  });
});

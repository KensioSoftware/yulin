import { TransactGetItemsCommand } from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

describe("DynamoDB TransactGetItemsCommand request validation", () => {
  it("requires TransactItems naming a Get", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

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
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

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
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

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
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When one entry names nothing to read.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactGetItems({ input: { TransactItems: [{}] } }),
    );

    // Then it is refused rather than read as an empty request.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A TransactGetItem carries a Get");
  });

  it("refuses two Gets of one item", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

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
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

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
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

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

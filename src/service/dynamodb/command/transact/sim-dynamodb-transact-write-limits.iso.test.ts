import {
  CreateTableCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * A ledger table, holding nothing yet.
 */
async function ledgerTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

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

const entryPut = {
  Put: { TableName: "LedgerTable", Item: { entryId: { S: "entry-1" } } },
};

describe("DynamoDB transactional write limits and reporting", () => {
  it("refuses a transaction over the size a request holds", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTable(simAws);

    // When 100 items of 45 KB each are written in one transaction.
    const padding = "x".repeat(45 * 1024);
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: Array.from({ length: 100 }, (_unused, index) => ({
            Put: {
              TableName: "LedgerTable",
              Item: {
                entryId: { S: `entry-${String(index)}` },
                padding: { S: padding },
              },
            },
          })),
        }),
      ),
    );

    // Then the transaction is refused for its size, though every item in it is
    // under the 400 KB an item holds.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Transaction request size has exceeded the maximum allowed size of " +
        "4194304 bytes",
    );
  });

  it("refuses the write reporting inputs this simulation does not model", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await ledgerTable(simAws);

    // When a transaction asks for a capacity cost.
    const capacity = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [entryPut],
          ReturnConsumedCapacity: "TOTAL",
        }),
      ),
    );

    // And when it asks for item collection sizes.
    const metrics = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [entryPut],
          ReturnItemCollectionMetrics: "SIZE",
        }),
      ),
    );

    // Then both are refused by name rather than reported on.
    assertInstanceOf(capacity, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(capacity.message, "ReturnConsumedCapacity");
    assertInstanceOf(metrics, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(metrics.message, "ReturnItemCollectionMetrics");
  });
});

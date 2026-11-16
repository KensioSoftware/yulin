import { TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

const entryPut = {
  Put: { TableName: "LedgerTable", Item: { entryId: { S: "entry-1" } } },
};

describe("DynamoDB transactional write limits and reporting", () => {
  it("refuses a transaction over the size a request holds", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

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

  it("refuses reporting values AWS does not have", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "LedgerTable", partitionKeyName: "entryId" },
      simAws,
    );

    // When a transaction asks for a capacity report AWS has no level for.
    const capacity = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems({
        input: {
          TransactItems: [entryPut],
          ReturnConsumedCapacity: "ALL",
        },
      }),
    );

    // And when it asks for item collection metrics the same way.
    const metrics = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems({
        input: {
          TransactItems: [entryPut],
          ReturnItemCollectionMetrics: "ALL",
        },
      }),
    );

    // Then both are refused as AWS refuses them.
    assertInstanceOf(capacity, SimDynamoDbValidationException);
    assertStringIncludes(capacity.message, "returnConsumedCapacity");
    assertInstanceOf(metrics, SimDynamoDbValidationException);
    assertStringIncludes(metrics.message, "returnItemCollectionMetrics");
  });
});

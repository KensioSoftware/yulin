import {
  DeleteItemCommand,
  DeleteTableCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { simDynamoDbCreatedTableFactory } from "../table/sim-dynamodb-created-table.factory.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import type { SimDynamoDbStreamRecord } from "./sim-dynamodb-stream-record.js";
import { simDynamoDbStreamedTableFactory } from "./sim-dynamodb-streamed-table.factory.js";

/**
 * What a table's stream captured, oldest first.
 */
function capturedBy(
  table: SimDynamoDbTable,
): readonly SimDynamoDbStreamRecord[] {
  return table.stream.latest?.records ?? [];
}

/**
 * Write an order onto a streamed table.
 */
async function putOrder(simAws: SimAws, orderId: string): Promise<void> {
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "orders",
      Item: { orderId: { S: orderId }, total: { N: "101" } },
    }),
  );
}

describe("DynamoDB stream capture of what did not happen", () => {
  it("captures nothing on a table with no stream", async () => {
    // Given a table created without a StreamSpecification.
    const simAws = new SimAws();
    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "orders", partitionKeyName: "orderId" },
      simAws,
    );

    // When items are written and deleted.
    await putOrder(simAws, "order-1");
    await simAws.dynamoDb().deleteItem(
      new DeleteItemCommand({
        TableName: "orders",
        Key: { orderId: { S: "order-1" } },
      }),
    );

    // Then the table never made a stream to capture any of it onto, and says
    // so rather than reporting one that is switched off.
    assertUndefined(table.stream.latest);
    assertUndefined(table.stream.specification());
  });

  it("captures nothing for a failed conditional write", async () => {
    // Given an item on a streamed table.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    await putOrder(simAws, "order-1");

    // When a write guarded by a condition that does not hold is refused.
    await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().putItem(
        new PutItemCommand({
          TableName: "orders",
          Item: { orderId: { S: "order-1" }, total: { N: "202" } },
          ConditionExpression: "attribute_not_exists(orderId)",
        }),
      ),
    );

    // Then only the write that happened is on the stream.
    assertArrayLength(capturedBy(table), 1);
  });

  it("captures nothing for a write the table refused", async () => {
    // Given a streamed table holding one item.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    await putOrder(simAws, "order-1");

    // When a write is refused for a key of the wrong type, which is checked
    // before anything reaches the items.
    await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().putItem(
        new PutItemCommand({
          TableName: "orders",
          Item: { orderId: { N: "1" }, total: { N: "202" } },
        }),
      ),
    );

    // Then nothing was captured for it, since nothing changed.
    assertArrayLength(capturedBy(table), 1);
  });

  it("captures nothing for a cancelled transaction", async () => {
    // Given a streamed table holding one item.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    await putOrder(simAws, "order-1");

    // When a transaction whose second action cannot be applied is cancelled.
    await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: "orders",
                Item: { orderId: { S: "order-2" }, total: { N: "1" } },
              },
            },
            {
              Put: {
                TableName: "orders",
                Item: { orderId: { S: "order-1" }, total: { N: "2" } },
                ConditionExpression: "attribute_not_exists(orderId)",
              },
            },
          ],
        }),
      ),
    );

    // Then neither action reached the items, so neither is on the stream.
    assertArrayLength(capturedBy(table), 1);
  });

  it("captures nothing for a delete of a key holding nothing", async () => {
    // Given a streamed table holding nothing.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);

    // When a key that was never written is deleted, which DynamoDB accepts.
    await simAws.dynamoDb().deleteItem(
      new DeleteItemCommand({
        TableName: "orders",
        Key: { orderId: { S: "order-1" } },
      }),
    );

    // Then nothing was removed, so there is no removal to report.
    assertArrayLength(capturedBy(table), 0);
  });

  it("captures nothing for the items a deleted table was holding", async () => {
    // Given a streamed table holding an item.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    await putOrder(simAws, "order-1");

    // When the table itself is deleted.
    await simAws
      .dynamoDb()
      .deleteTable(new DeleteTableCommand({ TableName: "orders" }));
    await simAws.backgroundTasksComplete();

    // Then the items go with the table rather than being removed one at a
    // time, so only the write that happened is on the stream.
    assertArrayLength(capturedBy(table), 1);
  });
});

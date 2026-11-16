import {
  BatchWriteItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { simDynamoDbLocallyIndexedTableFactory } from "../secondary-index/sim-dynamodb-locally-indexed-table.factory.js";
import { simDynamoDbCreatedTableFactory } from "../table/sim-dynamodb-created-table.factory.js";

/**
 * A new order for one customer.
 */
const order = {
  customerId: { S: "customer-9" },
  orderId: { S: "order-9" },
  placedAt: { S: "2026-03-01" },
};

describe("DynamoDB ItemCollectionMetrics", () => {
  it("reports the collection a write left an item in", async () => {
    // Given a table with a local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When an order is put, asking for the collection size.
    const output = await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: order,
        ReturnItemCollectionMetrics: "SIZE",
      }),
    );

    // Then the customer's collection is reported as under a gigabyte.
    assertObjectEquals(output.ItemCollectionMetrics, {
      ItemCollectionKey: { customerId: { S: "customer-9" } },
      SizeEstimateRangeGB: [0, 1],
    });
  });

  it("reports nothing for a table with no local index", async () => {
    // Given a table with no local secondary index.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );

    // When an item is put, asking for the collection size.
    const output = await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: "order-1" } },
        ReturnItemCollectionMetrics: "SIZE",
      }),
    );

    // Then there is no item collection to report.
    assertUndefined(output.ItemCollectionMetrics);
  });

  it("reports each collection a batch touched once, under its table", async () => {
    // Given a table with a local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When a batch puts two orders for one customer.
    const output = await simAws.dynamoDb().batchWriteItem(
      new BatchWriteItemCommand({
        RequestItems: {
          OrdersTable: [
            { PutRequest: { Item: order } },
            {
              PutRequest: { Item: { ...order, orderId: { S: "order-10" } } },
            },
          ],
        },
        ReturnItemCollectionMetrics: "SIZE",
      }),
    );

    // Then the customer's collection is reported once.
    assertObjectEquals(output.ItemCollectionMetrics, {
      OrdersTable: [
        {
          ItemCollectionKey: { customerId: { S: "customer-9" } },
          SizeEstimateRangeGB: [0, 1],
        },
      ],
    });
  });

  it("refuses a ReturnItemCollectionMetrics AWS does not have", async () => {
    // Given a table with a local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When a put asks for a level of report AWS has no name for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().putItem({
        input: {
          TableName: "OrdersTable",
          Item: order,
          ReturnItemCollectionMetrics: "ALL",
        },
      }),
    );

    // Then it is refused in AWS's words.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "[SIZE, NONE]");
  });
});

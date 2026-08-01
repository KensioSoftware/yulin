import { PutItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import type { SimScanCommandOutput } from "./scan.command.js";

/**
 * A table holding one order per customer, every other one of them open.
 */
async function ordersTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDbCollectionTableFactory.make({}, simAws);

  const orders = [
    { customerId: "c-1", status: "OPEN" },
    { customerId: "c-2", status: "SHIPPED" },
    { customerId: "c-3", status: "OPEN" },
    { customerId: "c-4", status: "SHIPPED" },
  ];

  await Promise.all(
    orders.map(async (order) =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "OrdersTable",
          Item: {
            customerId: { S: order.customerId },
            orderId: { S: "2026-01" },
            status: { S: order.status },
          },
        }),
      ),
    ),
  );

  return simDynamoDb;
}

/**
 * The customers a page came back with, put in order.
 *
 * A scan reads partition keys in hash order, which is deliberately arbitrary,
 * so a test asserting which items came back sorts them first.
 */
function customerIds(output: SimScanCommandOutput): readonly string[] {
  return (output.Items ?? [])
    .map((item) => item["customerId"]?.S ?? "")
    .toSorted((left, right) => left.localeCompare(right));
}

describe("DynamoDB ScanCommand FilterExpression", () => {
  it("drops the items the filter does not hold for", async () => {
    // Given a table holding open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the table is scanned with a filter.
    const output = await simDynamoDb.scan(
      new ScanCommand({
        TableName: "OrdersTable",
        FilterExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":open": { S: "OPEN" } },
      }),
    );

    // Then only the items the filter kept come back, and the counts say how
    // many were read to find them.
    assertArrayEquals(customerIds(output), ["c-1", "c-3"]);
    assertIdentical(output.Count, 2);
    assertIdentical(output.ScannedCount, 4);
  });

  it("takes a scan filter naming a key attribute", async () => {
    // Given a table holding open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the table is scanned with a filter on the partition key, which the
    // same query would be refused for.
    const output = await simDynamoDb.scan(
      new ScanCommand({
        TableName: "OrdersTable",
        FilterExpression: "customerId = :customer",
        ExpressionAttributeValues: { ":customer": { S: "c-2" } },
      }),
    );

    // Then it is read: a scan narrows nothing, so a key attribute is an
    // attribute like any other.
    assertArrayEquals(customerIds(output), ["c-2"]);
  });

  it("applies the filter after the Limit rather than before it", async () => {
    // Given a table holding open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a page of two items is scanned with a filter.
    const output = await simDynamoDb.scan(
      new ScanCommand({
        TableName: "OrdersTable",
        FilterExpression: "#status = :shipped",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":shipped": { S: "SHIPPED" } },
        Limit: 2,
      }),
    );

    // Then the limit cut the read at two items before the filter saw them, so
    // the page carries at most those two and a token to carry on from.
    assertIdentical(output.ScannedCount, 2);
    assertIdentical(output.Count, (output.Items ?? []).length);
    assertNonNullable(output.LastEvaluatedKey);
  });
});

import { PutItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbResourceNotFoundException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import type { SimScanCommandOutput } from "./scan.command.js";

/**
 * The customers a scan of the table below walks, and the orders each of them
 * holds.
 */
const orders: Readonly<Record<string, readonly string[]>> = {
  "c-1": ["2026-03", "2026-01", "2026-02"],
  "c-2": ["2026-01"],
  "c-3": ["2027-01", "2026-12"],
  "c-4": ["2026-05"],
  "c-5": ["2026-07", "2026-06"],
};

/**
 * A table keyed by customer and order, holding several item collections.
 *
 * The orders are written out of sort key order, so the order a scan answers in
 * is the table's rather than the order they arrived in.
 */
async function ordersTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDbCollectionTableFactory.make({}, simAws);

  await Promise.all(
    Object.entries(orders).flatMap(([customerId, orderIds]) =>
      orderIds.map(async (orderId) =>
        simDynamoDb.putItem(
          new PutItemCommand({
            TableName: "OrdersTable",
            Item: { customerId: { S: customerId }, orderId: { S: orderId } },
          }),
        ),
      ),
    ),
  );

  return simDynamoDb;
}

/**
 * The partition keys a page came back with, in the order they came back in.
 */
function customerIds(output: SimScanCommandOutput): readonly string[] {
  return (output.Items ?? []).map((item) => item["customerId"]?.S ?? "");
}

/**
 * The orders one customer came back with, in the order they came back in.
 */
function orderIdsOf(
  output: SimScanCommandOutput,
  customerId: string,
): readonly string[] {
  return (output.Items ?? [])
    .filter((item) => item["customerId"]?.S === customerId)
    .map((item) => item["orderId"]?.S ?? "");
}

describe("DynamoDB ScanCommand", () => {
  it("answers with every item the table holds", async () => {
    // Given a table holding several customers' orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the table is scanned.
    const output = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
    );

    // Then every item comes back, whatever partition key it sits under, and
    // nothing is left to resume from.
    assertArrayLength(output.Items ?? [], 9);
    assertIdentical(output.Count, 9);
    assertIdentical(output.ScannedCount, 9);
    assertUndefined(output.LastEvaluatedKey);
  });

  it("answers with an empty page for a table holding nothing", async () => {
    // Given a table with no items written to it.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDbCollectionTableFactory.make({}, simAws);

    // When the table is scanned.
    const output = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
    );

    // Then the page is empty rather than missing, and there is nothing to
    // resume from.
    assertArrayLength(output.Items ?? [], 0);
    assertIdentical(output.Count, 0);
    assertUndefined(output.LastEvaluatedKey);
  });

  it("answers with one partition key's items in sort key order", async () => {
    // Given a table holding one customer's orders, written out of order.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the table is scanned.
    const output = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
    );

    // Then the items under one partition key are ascending by sort key, as
    // DynamoDB keeps them.
    assertArrayEquals(orderIdsOf(output, "c-1"), [
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    assertArrayEquals(orderIdsOf(output, "c-3"), ["2026-12", "2027-01"]);
  });

  it("keeps each partition key's items together", async () => {
    // Given a table holding several customers' orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the table is scanned.
    const output = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
    );

    // Then a partition key value appears in one run rather than scattered
    // through the page, since a scan walks whole item collections.
    const runs = customerIds(output).filter(
      (customerId, index, all) => customerId !== all[index - 1],
    );

    assertArrayLength(runs, Object.keys(orders).length);
  });

  it("does not sort the partition keys it answers with", async () => {
    // Given a table holding several customers' orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the table is scanned.
    const output = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
    );

    // Then the partition keys come back in an arbitrary order rather than a
    // sorted one. A test that leaned on a global sort here would pass and then
    // fail against the real service, which sorts nothing across partitions.
    const answered = customerIds(output);
    const sorted = answered.toSorted((one, other) => one.localeCompare(other));

    assertFalse(answered.join(",") === sorted.join(","));
  });

  it("walks the table the same way every time", async () => {
    // Given a table holding several customers' orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the same table is scanned twice.
    const first = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
    );
    const second = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
    );

    // Then both scans read it in the same order. The order is arbitrary, not
    // varying: an ExclusiveStartKey could not resume a scan otherwise.
    assertArrayEquals(customerIds(second), customerIds(first));
  });

  it("takes a ConsistentRead, which it already is", async () => {
    // Given a table holding several customers' orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a scan asks for a strongly consistent read.
    const output = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable", ConsistentRead: true }),
    );

    // Then it reads the same items. Every write has landed by the time the call
    // that made it returned, so a simulated read is always the consistent one.
    assertArrayLength(output.Items ?? [], 9);
  });

  it("refuses a scan of a table that is not there", async () => {
    // Given a simulated DynamoDB holding no such table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    // When a table that was never created is scanned.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.scan(new ScanCommand({ TableName: "MissingTable" })),
    );

    // Then it is refused rather than answered with an empty page.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });
});

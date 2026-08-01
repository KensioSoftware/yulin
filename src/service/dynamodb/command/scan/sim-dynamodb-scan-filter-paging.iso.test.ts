import type {
  AttributeValue,
  ScanCommandInput,
} from "@aws-sdk/client-dynamodb";
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
 * The customers a page came back with.
 */
function customerIds(output: SimScanCommandOutput): readonly string[] {
  return (output.Items ?? []).map((item) => item["customerId"]?.S ?? "");
}

/**
 * Customers put in order.
 *
 * A scan reads partition keys in hash order, which is deliberately arbitrary,
 * so a test asserting which items came back sorts them first.
 */
function inOrder(customers: readonly string[]): readonly string[] {
  return customers.toSorted((left, right) => left.localeCompare(right));
}

/**
 * Scan the table for open orders, however the test wants the read divided.
 */
async function openOrders(
  simDynamoDb: SimDynamoDb,
  input: Omit<ScanCommandInput, "TableName">,
): Promise<SimScanCommandOutput> {
  return simDynamoDb.scan(
    new ScanCommand({
      TableName: "OrdersTable",
      FilterExpression: "#status = :open",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":open": { S: "OPEN" } },
      ...input,
    }),
  );
}

describe("DynamoDB ScanCommand FilterExpression paging", () => {
  it("answers with an empty page it can still be resumed from", async () => {
    // Given a table holding open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When one item is read with a filter no item holds for.
    const page = await openOrders(simDynamoDb, {
      FilterExpression: "#status = :gone",
      ExpressionAttributeValues: { ":gone": { S: "CANCELLED" } },
      Limit: 1,
    });

    // Then the page carries no items and a token to carry on from, since the
    // read stopped at the limit rather than at the end of the table.
    assertArrayEquals(customerIds(page), []);
    assertIdentical(page.Count, 0);
    assertIdentical(page.ScannedCount, 1);
    assertNonNullable(page.LastEvaluatedKey);
  });

  it("reads a whole table through a filtered paging loop", async () => {
    // Given a table holding open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the table is read one item at a time until the token runs out.
    const read: string[] = [];
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;

    do {
      // eslint-disable-next-line no-await-in-loop -- a page at a time is the point.
      const page = await openOrders(simDynamoDb, {
        Limit: 1,
        ExclusiveStartKey: exclusiveStartKey,
      });

      read.push(...customerIds(page));
      exclusiveStartKey = page.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);

    // Then every matching item is found. Most of those pages held nothing, so
    // a loop stopping at the first empty page would have missed them.
    assertArrayEquals(inOrder(read), ["c-1", "c-3"]);
  });

  it("filters a segment of a parallel scan", async () => {
    // Given a table holding open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When every segment of a parallel scan is read with a filter.
    const pages = await Promise.all(
      [0, 1].map(async (segment) =>
        openOrders(simDynamoDb, { Segment: segment, TotalSegments: 2 }),
      ),
    );

    // Then the segments together hold the matching items, with the filter
    // applied to each segment's own page.
    const found = pages.flatMap((page) => customerIds(page));

    assertArrayEquals(inOrder(found), ["c-1", "c-3"]);
  });
});

import { ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertArrayLength,
  assertSetSize,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import {
  simDynamoDbStockedCustomerIds,
  simDynamoDbStockedTableFactory,
} from "../../table/sim-dynamodb-stocked-table.factory.js";
import type { SimScanCommandOutput } from "./scan.command.js";

/**
 * The customers the table these tests scan holds orders for.
 */
const customerIds = simDynamoDbStockedCustomerIds(20);

/**
 * A table holding two orders for each of twenty customers.
 */
async function ordersTable(simAws: SimAws): Promise<SimDynamoDb> {
  await simDynamoDbStockedTableFactory.make(
    { customerCount: customerIds.length },
    simAws,
  );

  return simAws.dynamoDb();
}

/**
 * Each item of a page, as the pair of key values that names it.
 */
function keysOf(output: SimScanCommandOutput): readonly string[] {
  return (output.Items ?? []).map(
    (item) => `${item["customerId"]?.S ?? ""}/${item["orderId"]?.S ?? ""}`,
  );
}

/**
 * Read every segment of a division, in segment order.
 */
async function everySegment(
  simDynamoDb: SimDynamoDb,
  totalSegments: number,
): Promise<readonly (readonly string[])[]> {
  const pages: (readonly string[])[] = [];

  for (let segment = 0; segment < totalSegments; segment++) {
    const command = new ScanCommand({
      TableName: "OrdersTable",
      Segment: segment,
      TotalSegments: totalSegments,
    });

    // eslint-disable-next-line no-await-in-loop -- one segment at a time, as a worker reads it.
    pages.push(keysOf(await simDynamoDb.scan(command)));
  }

  return pages;
}

describe("DynamoDB ScanCommand parallel segments", () => {
  it("covers the whole table across the segments", async () => {
    // Given a table holding forty items.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When each of four segments is scanned.
    const pages = await everySegment(simDynamoDb, 4);
    const read = pages.flat();

    // Then the segments together hold every item, and no item is in two of
    // them.
    assertArrayLength(read, customerIds.length * 2);
    assertSetSize(new Set(read), customerIds.length * 2);
  });

  it("puts every item of one partition key in one segment", async () => {
    // Given a table holding two orders for each customer.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When each of four segments is scanned.
    const pages = await everySegment(simDynamoDb, 4);

    // Then each customer's orders are in one of them, both together, since a
    // segment is a share of the partition keys rather than of the items.
    const holders = customerIds.map(
      (customerId) =>
        pages.filter((page) =>
          page.some((key) => key.startsWith(`${customerId}/`)),
        ).length,
    );

    assertArrayEquals(
      holders,
      customerIds.map(() => 1),
    );
  });

  it("reads the whole table as one segment out of one", async () => {
    // Given a table holding forty items.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a scan divides it into one segment, which is what a sequential scan
    // reads.
    const [single] = await everySegment(simDynamoDb, 1);
    const whole = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
    );

    // Then it reads the same items in the same order as a scan naming no
    // segment at all.
    assertArrayEquals(single ?? [], keysOf(whole));
  });

  it("answers with an empty page for a segment holding nothing", async () => {
    // Given a table holding one customer's orders.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDbStockedTableFactory.make({ customerCount: 1 }, simAws);

    // When it is divided into more segments than it has partition keys.
    const pages = await everySegment(simDynamoDb, 8);

    // Then most segments hold nothing, which is ordinary rather than a
    // failure.
    assertArrayLength(
      pages.filter((page) => page.length === 0),
      7,
    );
  });
});

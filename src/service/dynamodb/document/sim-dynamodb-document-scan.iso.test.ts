import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  paginateScan,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  assertArrayEquals,
  assertArrayLength,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

/**
 * The orders these tests read, one customer having more than one.
 */
const orders: readonly Record<string, unknown>[] = [
  { customerId: "cust-1", orderId: "order-1", total: 42, paid: true },
  { customerId: "cust-1", orderId: "order-2", total: 7, paid: false },
  { customerId: "cust-2", orderId: "order-3", total: 19, paid: true },
];

/**
 * An intercepted document client, and a table holding the orders above.
 *
 * The table is created and filled through the same document client, which is
 * what a test using the document client would do.
 */
async function interceptedOrders(
  simSdk: SimSdk,
): Promise<DynamoDBDocumentClient> {
  const documents = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "eu-west-2" }),
  );
  simSdk.intercept(documents);

  await documents.send(
    new CreateTableCommand({
      TableName: "OrdersTable",
      KeySchema: [
        { AttributeName: "customerId", KeyType: "HASH" },
        { AttributeName: "orderId", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "customerId", AttributeType: "S" },
        { AttributeName: "orderId", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simSdk.simAws.backgroundTasksComplete();

  await Promise.all(
    orders.map(
      async (order) =>
        await documents.send(
          new PutCommand({ TableName: "OrdersTable", Item: order }),
        ),
    ),
  );

  return documents;
}

/**
 * The order identifiers a page answered with, in a settled order.
 */
function orderIds(items: readonly Record<string, unknown>[]): string[] {
  return items
    .map((item): string => String(item["orderId"]))
    .toSorted((left, right) => left.localeCompare(right));
}

describe("simulated DynamoDB document client Scan", () => {
  it("round-trips native values through a Scan", async () => {
    // Given an intercepted document client with orders to read.
    using simSdk = new SimSdk();
    const documents = await interceptedOrders(simSdk);

    // When the table is scanned with a filter comparing against a native
    // value.
    const read = await documents.send(
      new ScanCommand({
        TableName: "OrdersTable",
        FilterExpression: "paid = :paid",
        ExpressionAttributeValues: { ":paid": true },
      }),
    );

    // Then the items that matched come back as plain JavaScript, with no
    // AttributeValues either way.
    assertArrayEquals(orderIds(read.Items ?? []), ["order-1", "order-3"]);
    assertObjectEquals(
      (read.Items ?? []).find((item) => item["orderId"] === "order-1"),
      { customerId: "cust-1", orderId: "order-1", total: 42, paid: true },
    );
  });

  it("carries a Scan on through its segments", async () => {
    // Given an intercepted document client with orders to read.
    using simSdk = new SimSdk();
    const documents = await interceptedOrders(simSdk);

    // When the table is scanned in two segments.
    const segments = await Promise.all(
      [0, 1].map(
        async (segment) =>
          await documents.send(
            new ScanCommand({
              TableName: "OrdersTable",
              TotalSegments: 2,
              Segment: segment,
            }),
          ),
      ),
    );

    // Then the segments between them answer with every item, each as plain
    // JavaScript.
    const found = segments.flatMap((page) => page.Items ?? []);
    assertArrayEquals(orderIds(found), ["order-1", "order-2", "order-3"]);
  });

  it("pages a Scan through the document client paginator", async () => {
    // Given an intercepted document client with orders to read.
    using simSdk = new SimSdk();
    const documents = await interceptedOrders(simSdk);

    // When paginateScan reads a page at a time. It sends the same document
    // Command through the intercepted send, so nothing else is needed.
    const pages = paginateScan(
      { client: documents, pageSize: 1 },
      { TableName: "OrdersTable" },
    );
    const found: Record<string, unknown>[] = [];
    for await (const page of pages) {
      found.push(...(page.Items ?? []));
    }

    // Then the key each page fed the next was the plain JavaScript one it had
    // been given, and every item was read once.
    assertArrayLength(found, orders.length);
    assertArrayEquals(orderIds(found), ["order-1", "order-2", "order-3"]);
  });
});

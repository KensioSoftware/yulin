import { ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayIncludesAll,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import type {
  SimQueryCommandInput,
  SimQueryCommandOutput,
} from "../command/query/query.command.js";
import type { SimScanCommandOutput } from "../command/scan/scan.command.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDb } from "../sim-dynamodb.js";
import { simDynamoDbLocallyIndexedTableFactory } from "./sim-dynamodb-locally-indexed-table.factory.js";

/**
 * Two of this customer's orders were placed in the same month, so they share a
 * whole index key and only the table sort key separates them. That is the case
 * a token carrying the index key alone could not resume.
 */
const firstCustomer = {
  TableName: "OrdersTable",
  IndexName: "byPlacedAt",
  KeyConditionExpression: "customerId = :customerId",
  ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
} as const satisfies SimQueryCommandInput;

/**
 * Read one order off the index, resuming after a token when given one.
 */
async function orderPage(
  simDynamoDb: SimDynamoDb,
  after?: Readonly<Record<string, SimDynamoDbAttributeValue>>,
): Promise<SimQueryCommandOutput> {
  return await simDynamoDb.query({
    input: { ...firstCustomer, Limit: 1, ExclusiveStartKey: after },
  });
}

/**
 * The order ids a page came back with.
 */
function orderIds(
  page: SimQueryCommandOutput | SimScanCommandOutput,
): readonly string[] {
  return (page.Items ?? []).map((item) => item["orderId"]?.S ?? "");
}

describe("DynamoDB paging a local secondary index", () => {
  it("hands out a token carrying the partition key and both sort keys", async () => {
    // Given a table with a local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When one entry of the index is read.
    const page = await orderPage(simAws.dynamoDb());

    // Then the token names the entry by the table partition key, the index sort
    // key and the table sort key. The index key alone would not, since two
    // entries share one.
    const token = page.LastEvaluatedKey;
    assertDefined(token, "the LastEvaluatedKey of an index page");
    assertArrayLength(Object.keys(token), 3);
    assertIdentical(token["customerId"]?.S, "customer-1");
    assertIdentical(token["placedAt"]?.S, "2026-01");
    assertIdentical(token["orderId"]?.S, "order-02");
  });

  it("resumes exactly when two entries share an index key", async () => {
    // Given a page that stopped on the first of two entries sharing a month.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);
    const simDynamoDb = simAws.dynamoDb();
    const first = await orderPage(simDynamoDb);

    // When the walk resumes from that token.
    const second = await orderPage(simDynamoDb, first.LastEvaluatedKey);

    // Then the other entry of that index key comes next, rather than the walk
    // repeating one or skipping past both.
    assertIdentical(orderIds(first)[0], "order-02");
    assertIdentical(orderIds(second)[0], "order-04");
  });

  it("walks a collection to the end", async () => {
    // Given a table whose index holds three of one customer's orders.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);
    const simDynamoDb = simAws.dynamoDb();

    // When the collection is read an entry at a time.
    const first = await orderPage(simDynamoDb);
    const second = await orderPage(simDynamoDb, first.LastEvaluatedKey);
    const third = await orderPage(simDynamoDb, second.LastEvaluatedKey);
    const fourth = await orderPage(simDynamoDb, third.LastEvaluatedKey);

    // Then every entry comes back once, in index order, and the walk then finds
    // nothing past the end of the collection.
    assertIdentical(
      [first, second, third].flatMap((page) => orderIds(page)).join(","),
      "order-02,order-04,order-01",
    );
    assertArrayLength(orderIds(fourth), 0);
    assertUndefined(fourth.LastEvaluatedKey);
  });

  it("refuses a token missing the table sort key", async () => {
    // Given a table with a local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When a query resumes from the index key alone.
    const error = await assertThrowsErrorAsync(async () =>
      orderPage(simAws.dynamoDb(), {
        customerId: { S: "customer-1" },
        placedAt: { S: "2026-01" },
      }),
    );

    // Then it is refused. The index key names two entries, so resuming from it
    // would repeat one or skip one.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "orderId");
  });

  it("scans the index rather than the table", async () => {
    // Given a table whose index does not hold every order.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When the index is scanned.
    const page = await simAws
      .dynamoDb()
      .scan(
        new ScanCommand({ TableName: "OrdersTable", IndexName: "byPlacedAt" }),
      );

    // Then the four dated orders come back and the two undated ones do not.
    assertArrayLength(orderIds(page), 4);
    assertArrayIncludesAll(orderIds(page), [
      "order-01",
      "order-02",
      "order-04",
      "order-05",
    ]);
  });

  it("scans the index consistently", async () => {
    // Given a table with a local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When the index is scanned with a strongly consistent read.
    const page = await simAws.dynamoDb().scan({
      input: {
        TableName: "OrdersTable",
        IndexName: "byPlacedAt",
        ConsistentRead: true,
      },
    });

    // Then it is answered rather than refused, as a query of it is.
    assertArrayLength(orderIds(page), 4);
  });

  it("pages a scan of the index", async () => {
    // Given a table with a local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);
    const simDynamoDb = simAws.dynamoDb();

    // When a scan of it stops at a limit and resumes.
    const first = await simDynamoDb.scan({
      input: { TableName: "OrdersTable", IndexName: "byPlacedAt", Limit: 3 },
    });
    const second = await simDynamoDb.scan({
      input: {
        TableName: "OrdersTable",
        IndexName: "byPlacedAt",
        ExclusiveStartKey: first.LastEvaluatedKey,
      },
    });

    // Then the two pages hold the index between them, each entry once.
    assertArrayLength([...orderIds(first), ...orderIds(second)], 4);
    assertUndefined(second.LastEvaluatedKey);
  });
});

import {
  DeleteItemCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";
import type { SimScanCommandOutput } from "./scan.command.js";

/**
 * A table keyed by customer and order, holding two orders for each of three
 * customers.
 */
async function ordersTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDbCollectionTableFactory.make({}, simAws);

  await Promise.all(
    ["c-1", "c-2", "c-3"].flatMap((customerId) =>
      ["2026-02", "2026-01"].map(async (orderId) =>
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
 * Each item of a page, as the pair of key values that names it.
 */
function keysOf(output: SimScanCommandOutput): readonly string[] {
  return (output.Items ?? []).map(
    (item) => `${item["customerId"]?.S ?? ""}/${item["orderId"]?.S ?? ""}`,
  );
}

/**
 * Read a whole table by looping until the token runs out.
 */
async function pagedScan(
  simDynamoDb: SimDynamoDb,
  limit: number,
): Promise<readonly string[]> {
  const read: string[] = [];
  let exclusiveStartKey: Record<string, SimDynamoDbAttributeValue> | undefined;

  do {
    // oxlint-disable-next-line no-await-in-loop -- a page at a time is the point.
    const page = await simDynamoDb.scan(
      new ScanCommand({
        TableName: "OrdersTable",
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    read.push(...keysOf(page));
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey !== undefined);

  return read;
}

describe("DynamoDB ScanCommand paging", () => {
  it("stops a page at the Limit and says where to resume", async () => {
    // Given a table holding six items.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a scan asks for two of them.
    const page = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable", Limit: 2 }),
    );

    // Then the page holds two items and hands out the primary key of the one
    // the walk stopped on.
    assertArrayLength(page.Items ?? [], 2);
    assertIdentical(page.Count, 2);

    const token = page.LastEvaluatedKey;
    assertNonNullable(token);
    assertArrayEquals(
      Object.keys(token).toSorted((one, other) => one.localeCompare(other)),
      ["customerId", "orderId"],
    );
  });

  it("reads the whole table by looping until the token runs out", async () => {
    // Given a table holding six items.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When it is read a page at a time, and read again in one go.
    const paged = await pagedScan(simDynamoDb, 2);
    const whole = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
    );

    // Then the pages together are the scan, in the same order, with nothing
    // read twice and nothing missed.
    assertArrayEquals(paged, keysOf(whole));
  });

  it("hands out a token on the last item, then an empty page", async () => {
    // Given a table holding six items.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a scan reaches its Limit on the last item of the table.
    const page = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable", Limit: 6 }),
    );

    const token = page.LastEvaluatedKey;
    assertNonNullable(token);

    const next = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable", ExclusiveStartKey: token }),
    );

    // Then it still hands out a token, and the next page is empty with no
    // token of its own. Real DynamoDB cannot know the table is exhausted
    // without looking past the last item.
    assertArrayEmpty(next.Items ?? []);
    assertUndefined(next.LastEvaluatedKey);
  });

  it("resumes after an item that has since been deleted", async () => {
    // Given a table holding six items, and the token of a page of one.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    const first = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable", Limit: 1 }),
    );
    const token = first.LastEvaluatedKey;
    assertNonNullable(token);

    // When the item the token names is deleted before the scan resumes.
    await simDynamoDb.deleteItem(
      new DeleteItemCommand({ TableName: "OrdersTable", Key: token }),
    );

    const next = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable", ExclusiveStartKey: token }),
    );

    // Then the rest of the table still comes back. A token says where to
    // resume rather than which item to return to.
    assertArrayLength(next.Items ?? [], 5);
  });

  it("refuses an ExclusiveStartKey naming no attribute", async () => {
    // Given a table holding six items.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a scan resumes from a token with nothing in it.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.scan(
        new ScanCommand({ TableName: "OrdersTable", ExclusiveStartKey: {} }),
      ),
    );

    // Then it is refused, since it names no item to resume after.
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it("refuses an ExclusiveStartKey that is not a primary key", async () => {
    // Given a table holding six items.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a scan resumes from a token naming an attribute the key schema does
    // not have.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.scan(
        new ScanCommand({
          TableName: "OrdersTable",
          ExclusiveStartKey: {
            customerId: { S: "c-1" },
            orderId: { S: "2026-01" },
            status: { S: "shipped" },
          },
        }),
      ),
    );

    // Then it is refused the same way the Key of a GetItem would be.
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it.each([0, -1, 1.5])("refuses a Limit of %s", async (limit) => {
    // Given a table holding six items.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a scan asks for a page size that is not a whole number of items.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.scan(
        new ScanCommand({ TableName: "OrdersTable", Limit: limit }),
      ),
    );

    // Then it is refused rather than read as no limit at all.
    assertInstanceOf(error, SimDynamoDbValidationException);
  });
});

import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimQueryCommandInput } from "../command/query/query.command.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbIndexedTableInput } from "./sim-dynamodb-indexed-table.factory.js";
import { simDynamoDbIndexedTableFactory } from "./sim-dynamodb-indexed-table.factory.js";

const openOrders = {
  TableName: "OrdersTable",
  IndexName: "byStatus",
  KeyConditionExpression: "#status = :status",
  ExpressionAttributeNames: { "#status": "status" },
  ExpressionAttributeValues: { ":status": { S: "OPEN" } },
} as const satisfies SimQueryCommandInput;

/**
 * Read one item off an index projecting what a test asked it to.
 */
async function firstOpenOrder(
  table: Partial<SimDynamoDbIndexedTableInput>,
  overrides: Partial<SimQueryCommandInput> = {},
): Promise<Readonly<Record<string, { S?: string }>>> {
  const simAws = new SimAws();
  await simDynamoDbIndexedTableFactory.make(table, simAws);

  const page = await simAws
    .dynamoDb()
    .query({ input: { ...openOrders, ...overrides } });

  return page.Items?.[0] ?? {};
}

describe("DynamoDB reads of what an index projects", () => {
  it("answers a KEYS_ONLY index with the index and table keys", async () => {
    // When an index projecting only keys is read.
    const item = await firstOpenOrder({ projectionType: "KEYS_ONLY" });

    // Then the index key and the table key come back, and nothing else. That
    // is what the index carries, so answering with the whole item would be a
    // page real DynamoDB never hands out.
    assertIdentical(item["status"]?.S, "OPEN");
    assertIdentical(item["shippedAt"]?.S, "2026-01");
    assertIdentical(item["orderId"]?.S, "order-01");
    assertUndefined(item["title"]);
  });

  it("answers an INCLUDE index with the attributes it adds", async () => {
    // When an index including one attribute is read.
    const item = await firstOpenOrder({
      projectionType: "INCLUDE",
      nonKeyAttributes: ["title"],
    });

    // Then the keys come back with the included attribute alongside them.
    assertIdentical(item["orderId"]?.S, "order-01");
    assertIdentical(item["title"]?.S, "Order order-01");
  });

  it("answers an ALL index with the whole item", async () => {
    // When an index projecting everything is read.
    const item = await firstOpenOrder({ projectionType: "ALL" });

    // Then nothing is cut out of the item.
    assertIdentical(item["title"]?.S, "Order order-01");
  });

  it("defaults to the attributes the index projects", async () => {
    // When an index is read with no Select at all.
    const item = await firstOpenOrder({ projectionType: "KEYS_ONLY" });

    // Then the read answers with what the index projects rather than with the
    // whole item, which is what ALL_PROJECTED_ATTRIBUTES means and what a read
    // of an index defaults to.
    assertUndefined(item["title"]);
  });

  it("takes ALL_PROJECTED_ATTRIBUTES written out", async () => {
    // When an index is read asking for what it projects by name.
    const item = await firstOpenOrder(
      { projectionType: "KEYS_ONLY" },
      { Select: "ALL_PROJECTED_ATTRIBUTES" },
    );

    // Then it answers the same way the default does.
    assertIdentical(item["orderId"]?.S, "order-01");
    assertUndefined(item["title"]);
  });

  it("refuses ALL_ATTRIBUTES on an index that projects less", async () => {
    // Given a table whose index carries only its keys.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make(
      { projectionType: "KEYS_ONLY" },
      simAws,
    );

    // When a read of it asks for whole items.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDb()
        .query({ input: { ...openOrders, Select: "ALL_ATTRIBUTES" } }),
    );

    // Then it is refused rather than answered with what the index has. Real
    // DynamoDB would have to read the table for each item to answer it.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Select type ALL_ATTRIBUTES is not supported for global secondary " +
        "index byStatus because its projection type is not ALL",
    );
  });

  it("takes ALL_ATTRIBUTES on an index that projects everything", async () => {
    // When an index projecting the whole item is asked for whole items.
    const item = await firstOpenOrder(
      { projectionType: "ALL" },
      { Select: "ALL_ATTRIBUTES" },
    );

    // Then it answers, since the index carries what was asked for.
    assertIdentical(item["title"]?.S, "Order order-01");
  });

  it("refuses a filter naming an attribute the index does not project", async () => {
    // Given a table whose index carries only its keys.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make(
      { projectionType: "KEYS_ONLY" },
      simAws,
    );

    // When a read of it filters on an attribute outside the projection.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().query({
        input: {
          ...openOrders,
          FilterExpression: "title = :title",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":status": { S: "OPEN" },
            ":title": { S: "Order order-01" },
          },
        },
      }),
    );

    // Then it is refused. The attribute is not on the items the index holds,
    // so the filter would drop every one of them and the page would read as a
    // collection that happens to be empty.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "title is not projected into the global secondary index byStatus",
    );
  });

  it("takes a filter naming an attribute the index does project", async () => {
    // Given a table whose index includes one attribute beyond its keys.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make(
      { projectionType: "INCLUDE", nonKeyAttributes: ["title"] },
      simAws,
    );

    // When a read of it filters on that attribute.
    const page = await simAws.dynamoDb().query({
      input: {
        ...openOrders,
        FilterExpression: "title = :title",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": { S: "OPEN" },
          ":title": { S: "Order order-01" },
        },
      },
    });

    // Then the filter runs, keeping the one item it names.
    assertIdentical(page.Count, 1);
    assertIdentical(page.ScannedCount, 2);
  });

  it("refuses a projection naming an attribute the index does not project", async () => {
    // Given a table whose index carries only its keys.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make(
      { projectionType: "KEYS_ONLY" },
      simAws,
    );

    // When a read of it projects an attribute outside the projection.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().query({
        input: { ...openOrders, ProjectionExpression: "title" },
      }),
    );

    // Then it is refused, the way a filter naming the same attribute is. The
    // index does not hold it, so it would be missing from every item, and an
    // attribute quietly missing reads as an item that never had one.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "title is not projected into the global secondary index byStatus",
    );
  });

  it("takes a projection naming an attribute the index does project", async () => {
    // When an index including one attribute is read for that attribute.
    const item = await firstOpenOrder(
      { projectionType: "INCLUDE", nonKeyAttributes: ["title"] },
      { ProjectionExpression: "title" },
    );

    // Then the projection runs against what the index carries, cutting the
    // index keys the read walked by out of the answer.
    assertObjectEquals(item, { title: { S: "Order order-01" } });
  });
});

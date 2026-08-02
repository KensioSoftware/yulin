import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimQueryCommandInput } from "../command/query/query.command.js";
import type { SimDynamoDbLocallyIndexedTableInput } from "./sim-dynamodb-locally-indexed-table.factory.js";
import { simDynamoDbLocallyIndexedTableFactory } from "./sim-dynamodb-locally-indexed-table.factory.js";

const firstCustomer = {
  TableName: "OrdersTable",
  IndexName: "byPlacedAt",
  KeyConditionExpression: "customerId = :customerId",
  ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
} as const satisfies SimQueryCommandInput;

/**
 * Read one item off an index projecting what a test asked it to.
 */
async function firstOrder(
  table: Partial<SimDynamoDbLocallyIndexedTableInput>,
  overrides: Partial<SimQueryCommandInput> = {},
): Promise<Readonly<Record<string, { S?: string }>>> {
  const simAws = new SimAws();
  await simDynamoDbLocallyIndexedTableFactory.make(table, simAws);

  const page = await simAws
    .dynamoDb()
    .query({ input: { ...firstCustomer, ...overrides } });

  return page.Items?.[0] ?? {};
}

describe("DynamoDB reads beyond what a local secondary index projects", () => {
  it("answers a KEYS_ONLY index with the index and table keys", async () => {
    // When an index projecting only keys is read.
    const item = await firstOrder({ projectionType: "KEYS_ONLY" });

    // Then the index key and the table key come back, and nothing else. The
    // table sort key is in the entry whatever the projection asks for, since it
    // is what names the item the entry stands for.
    assertIdentical(item["customerId"]?.S, "customer-1");
    assertIdentical(item["placedAt"]?.S, "2026-01");
    assertIdentical(item["orderId"]?.S, "order-02");
    assertUndefined(item["title"]);
  });

  it("answers an INCLUDE index with the attributes it adds", async () => {
    // When an index including one attribute is read.
    const item = await firstOrder({
      projectionType: "INCLUDE",
      nonKeyAttributes: ["title"],
    });

    // Then the keys come back with the included attribute alongside them.
    assertIdentical(item["orderId"]?.S, "order-02");
    assertIdentical(item["title"]?.S, "Order order-02");
  });

  it("fetches an unprojected attribute from the base table", async () => {
    // When a read of a KEYS_ONLY index asks for whole items.
    const item = await firstOrder(
      { projectionType: "KEYS_ONLY" },
      { Select: "ALL_ATTRIBUTES" },
    );

    // Then it is answered rather than refused. An index entry sits in the same
    // partition as the item it indexes, so DynamoDB reads the item as it walks
    // and charges the extra read capacity for it. A global secondary index
    // refuses the same request.
    assertIdentical(item["title"]?.S, "Order order-02");
  });

  it("still defaults to the attributes the index projects", async () => {
    // When a KEYS_ONLY index is read with no Select at all.
    const item = await firstOrder({ projectionType: "KEYS_ONLY" });

    // Then only the keys come back. The base table fetch happens when a read
    // asks for more, not on every read.
    assertUndefined(item["title"]);
  });

  it("filters on an attribute the index does not project", async () => {
    // Given a table whose index carries only its keys.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make(
      { projectionType: "KEYS_ONLY" },
      simAws,
    );

    // When a read of it filters on an attribute outside the projection.
    const page = await simAws.dynamoDb().query({
      input: {
        ...firstCustomer,
        FilterExpression: "title = :title",
        ExpressionAttributeValues: {
          ":customerId": { S: "customer-1" },
          ":title": { S: "Order order-04" },
        },
      },
    });

    // Then the filter runs against the item in the base table, keeping the one
    // it names. Three index entries were evaluated to find it.
    assertIdentical(page.Count, 1);
    assertIdentical(page.ScannedCount, 3);
    assertIdentical(page.Items?.[0]?.["orderId"]?.S, "order-04");
  });

  it("answers a counted read the same way", async () => {
    // Given a table whose index carries only its keys.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make(
      { projectionType: "KEYS_ONLY" },
      simAws,
    );

    // When the index is counted rather than read.
    const page = await simAws
      .dynamoDb()
      .query({ input: { ...firstCustomer, Select: "COUNT" } });

    // Then the count is of the index entries, with no Items at all.
    assertIdentical(page.Count, 3);
    assertUndefined(page.Items);
  });
});

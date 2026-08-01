import {
  assertArrayEquals,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";
import type {
  SimQueryCommandInput,
  SimQueryCommandOutput,
} from "./query.command.js";

/**
 * A key a query resumes after, as a page hands it back.
 */
type QueryToken = Readonly<Record<string, SimDynamoDbAttributeValue>>;

/**
 * A table holding one customer's three orders, and one belonging to another.
 */
async function ordersTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();
  await simDynamoDbCollectionTableFactory.make({}, simAws);

  await Promise.all(
    ["order-1", "order-2", "order-3"].map(async (orderId) =>
      simDynamoDb.putItem({
        input: {
          TableName: "OrdersTable",
          Item: { customerId: { S: "c-1" }, orderId: { S: orderId } },
        },
      }),
    ),
  );

  await simDynamoDb.putItem({
    input: {
      TableName: "OrdersTable",
      Item: { customerId: { S: "c-2" }, orderId: { S: "order-1" } },
    },
  });

  return simDynamoDb;
}

/**
 * Read one page of the collection, with anything else a test wants to say.
 */
async function queryPage(
  simDynamoDb: SimDynamoDb,
  input: SimQueryCommandInput,
): Promise<SimQueryCommandOutput> {
  return await simDynamoDb.query({
    input: {
      TableName: "OrdersTable",
      KeyConditionExpression: "customerId = :customer",
      ExpressionAttributeValues: { ":customer": { S: "c-1" } },
      ...input,
    },
  });
}

/**
 * The sort keys a page came back with, in the order they came back in.
 */
function orderIds(output: SimQueryCommandOutput): readonly string[] {
  return (output.Items ?? []).map((item) => item["orderId"]?.S ?? "");
}

/**
 * Page the whole collection one item at a time, gathering what each page held.
 *
 * A caller pages until the token is gone rather than until a page is short,
 * which is what the walk is written for, so the reading is written that way
 * too.
 */
async function readPaged(
  simDynamoDb: SimDynamoDb,
  after: QueryToken | undefined,
  read: readonly string[],
): Promise<readonly string[]> {
  const output = await queryPage(simDynamoDb, {
    Limit: 1,
    ExclusiveStartKey: after,
  });
  const gathered = [...read, ...orderIds(output)];

  if (output.LastEvaluatedKey === undefined) {
    return gathered;
  }

  return await readPaged(simDynamoDb, output.LastEvaluatedKey, gathered);
}

describe("DynamoDB QueryCommand resuming", () => {
  it("reads every item exactly once when paging the collection", async () => {
    // Given a table holding three orders for one customer.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the collection is paged one item at a time until the token is gone.
    const read = await readPaged(simDynamoDb, undefined, []);

    // Then every item was read once, in order, and the paging terminated.
    assertArrayEquals(read, ["order-1", "order-2", "order-3"]);
  });

  it("resumes backwards for ScanIndexForward false", async () => {
    // Given a table holding three orders for one customer.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the collection is read backwards, resuming after the second item.
    const output = await queryPage(simDynamoDb, {
      ScanIndexForward: false,
      ExclusiveStartKey: {
        customerId: { S: "c-1" },
        orderId: { S: "order-2" },
      },
    });

    // Then it carries on the way it was going, which is downwards.
    assertArrayEquals(orderIds(output), ["order-1"]);
  });

  it("resumes after an item that has since been deleted", async () => {
    // Given a table holding three orders, one of which is then removed.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);
    const first = await queryPage(simDynamoDb, { Limit: 1 });
    assertNonNullable(first.LastEvaluatedKey);

    await simDynamoDb.deleteItem({
      input: {
        TableName: "OrdersTable",
        Key: { customerId: { S: "c-1" }, orderId: { S: "order-1" } },
      },
    });

    // When the next page resumes after the item that has gone.
    const output = await queryPage(simDynamoDb, {
      ExclusiveStartKey: first.LastEvaluatedKey,
    });

    // Then the token still works: it is a key to resume after rather than a
    // remembered position.
    assertArrayEquals(orderIds(output), ["order-2", "order-3"]);
  });

  it.each([0, -1, 1.5])("refuses a Limit of %s", async (limit) => {
    // Given a table holding three orders for one customer.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a page size no request could mean is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      queryPage(simDynamoDb, { Limit: limit }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "whole number of at least 1");
  });

  it("refuses an ExclusiveStartKey from another item collection", async () => {
    // Given a table holding orders for two customers.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a query resumes from a key belonging to the other customer.
    const error = await assertThrowsErrorAsync(async () =>
      queryPage(simDynamoDb, {
        ExclusiveStartKey: {
          customerId: { S: "c-2" },
          orderId: { S: "order-1" },
        },
      }),
    );

    // Then it is refused rather than read from the start of the collection.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "different item collection");
  });

  it("refuses an ExclusiveStartKey that is not a whole primary key", async () => {
    // Given a table holding three orders for one customer.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a query resumes from a key missing the sort key.
    const error = await assertThrowsErrorAsync(async () =>
      queryPage(simDynamoDb, {
        ExclusiveStartKey: { customerId: { S: "c-1" } },
      }),
    );

    // Then it is refused the way any incomplete Key is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "orderId");
  });

  it("refuses an ExclusiveStartKey naming no attribute at all", async () => {
    // Given a table holding three orders for one customer.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a query resumes from an empty key.
    const error = await assertThrowsErrorAsync(async () =>
      queryPage(simDynamoDb, { ExclusiveStartKey: {} }),
    );

    // Then it is refused, since it names no item to resume after.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "names no attribute at all");
  });
});

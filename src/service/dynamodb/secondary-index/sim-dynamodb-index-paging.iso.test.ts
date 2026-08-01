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
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDb } from "../sim-dynamodb.js";
import { simDynamoDbIndexedTableFactory } from "./sim-dynamodb-indexed-table.factory.js";

/**
 * The two shipped orders share a whole index key, so only the table key
 * separates them. That is the case a token carrying the index key alone could
 * not resume.
 */
const shippedOrders = {
  TableName: "OrdersTable",
  IndexName: "byStatus",
  KeyConditionExpression: "#status = :status",
  ExpressionAttributeNames: { "#status": "status" },
  ExpressionAttributeValues: { ":status": { S: "SHIPPED" } },
} as const satisfies SimQueryCommandInput;

/**
 * Read one page of the shipped orders, resuming after a token when given one.
 */
async function shippedPage(
  simDynamoDb: SimDynamoDb,
  after?: Readonly<Record<string, SimDynamoDbAttributeValue>>,
): Promise<SimQueryCommandOutput> {
  return await simDynamoDb.query({
    input: { ...shippedOrders, Limit: 1, ExclusiveStartKey: after },
  });
}

/**
 * The order ids a page came back with.
 */
function orderIds(page: SimQueryCommandOutput): readonly string[] {
  return (page.Items ?? []).map((item) => item["orderId"]?.S ?? "");
}

describe("DynamoDB paging a global secondary index", () => {
  it("hands out a token carrying the index key and the table key", async () => {
    // Given a table with an index.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When one item of the index is read.
    const page = await simAws
      .dynamoDb()
      .query({ input: { ...shippedOrders, Limit: 1 } });

    // Then the token names the item by both keys. The index key alone would
    // not, since two entries can share one.
    const token = page.LastEvaluatedKey;
    assertDefined(token, "the LastEvaluatedKey of an index page");
    assertIdentical(token["status"]?.S, "SHIPPED");
    assertDefined(token["shippedAt"], "the index sort key of the token");
    assertDefined(token["orderId"], "the table key of the token");
  });

  it("resumes exactly when two entries share an index key", async () => {
    // Given a table whose two shipped orders share a whole index key.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When the collection is paged one item at a time.
    const first = await shippedPage(simDynamoDb);
    const second = await shippedPage(simDynamoDb, first.LastEvaluatedKey);
    const third = await shippedPage(simDynamoDb, second.LastEvaluatedKey);
    const found = [...orderIds(first), ...orderIds(second), ...orderIds(third)];

    // Then each order comes back once, in whichever order the index put them.
    // Index key values are not unique, so nothing here promises which is first,
    // only that paging neither repeats nor skips one. A token carrying the
    // index key alone could not have told the two apart.
    assertArrayLength(found, 2);
    assertArrayIncludesAll(found, ["order-02", "order-04"]);
    assertUndefined(third.LastEvaluatedKey);
  });

  it("stops handing out a token once the collection runs out", async () => {
    // Given a table with two shipped orders in its index.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When both are read in one page.
    const page = await simAws
      .dynamoDb()
      .query({ input: { ...shippedOrders, Limit: 5 } });

    // Then no token comes back, since the walk stopped inside the limit.
    assertIdentical(page.Count, 2);
    assertUndefined(page.LastEvaluatedKey);
  });

  it("refuses a start key naming an attribute outside both keys", async () => {
    // Given a table with an index.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When a query resumes from a token carrying an attribute neither key has.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().query({
        input: {
          ...shippedOrders,
          ExclusiveStartKey: {
            status: { S: "SHIPPED" },
            shippedAt: { S: "2026-01" },
            orderId: { S: "order-02" },
            title: { S: "Order order-02" },
          },
        },
      }),
    );

    // Then it is refused rather than resumed from.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "the Key names the attribute title, which is part of neither the index " +
        "byStatus key nor the table's primary key",
    );
  });

  it("refuses a start key missing the table key", async () => {
    // Given a table with an index.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When a query resumes from a token carrying only the index key.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().query({
        input: {
          ...shippedOrders,
          ExclusiveStartKey: {
            status: { S: "SHIPPED" },
            shippedAt: { S: "2026-01" },
          },
        },
      }),
    );

    // Then it is refused. Without the table key the token names two items, so
    // resuming from it would either repeat one or skip one.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "One of the required keys was not given a value: orderId",
    );
  });
});

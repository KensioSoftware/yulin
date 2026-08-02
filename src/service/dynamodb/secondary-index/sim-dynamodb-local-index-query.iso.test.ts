import { QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../error/dynamodb.error.js";
import { simDynamoDbLocallyIndexedTableFactory } from "./sim-dynamodb-locally-indexed-table.factory.js";

/**
 * The order ids a page came back with, so a test names items rather than places.
 */
function orderIds(
  items: readonly Readonly<Record<string, { S?: string }>>[] | undefined,
): readonly string[] {
  return (items ?? []).map((item) => item["orderId"]?.S ?? "");
}

const firstCustomer = {
  TableName: "OrdersTable",
  IndexName: "byPlacedAt",
  KeyConditionExpression: "customerId = :customerId",
  ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
} as const;

describe("DynamoDB Query on a local secondary index", () => {
  it("reads a collection in the index sort key order", async () => {
    // Given a table whose index re-sorts each customer's orders by date.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When the customer's orders are read off the index.
    const page = await simAws
      .dynamoDb()
      .query(new QueryCommand({ ...firstCustomer }));

    // Then they come back by placedAt rather than by orderId, which is the
    // access pattern the table's own key could not serve. The two January
    // orders share a whole index key, so only the table sort key separates
    // them.
    assertIdentical(
      orderIds(page.Items).join(","),
      "order-02,order-04,order-01",
    );
  });

  it("leaves out an item missing the index sort key", async () => {
    // Given a table whose orders do not all carry a date.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When the customer's orders are read off the index.
    const page = await simAws.dynamoDb().query({ input: { ...firstCustomer } });

    // Then order-03 is absent. It has no placedAt, so the index simply does not
    // hold it rather than the write having been refused.
    assertArrayLength(orderIds(page.Items), 3);
  });

  it("still reads the whole collection off the table", async () => {
    // Given a table whose index does not hold every order.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When the same collection is read with no IndexName.
    const page = await simAws.dynamoDb().query({
      input: {
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customerId",
        ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
      },
    });

    // Then all four orders come back, in the table's own sort key order.
    assertIdentical(
      orderIds(page.Items).join(","),
      "order-01,order-02,order-03,order-04",
    );
  });

  it("answers a strongly consistent read", async () => {
    // Given a table with a local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When a query asks for a strongly consistent read of it.
    const page = await simAws
      .dynamoDb()
      .query({ input: { ...firstCustomer, ConsistentRead: true } });

    // Then it is answered rather than refused. The index sits in the same
    // partition as the item it indexes and is written with it, so there is no
    // window in which it lags behind the table.
    assertArrayLength(orderIds(page.Items), 3);
  });

  it("takes a sort key condition on the index sort key", async () => {
    // Given a table whose index is sorted by the month an order was placed.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When the customer's orders are narrowed to January.
    const page = await simAws.dynamoDb().query({
      input: {
        ...firstCustomer,
        KeyConditionExpression:
          "customerId = :customerId AND placedAt = :placedAt",
        ExpressionAttributeValues: {
          ":customerId": { S: "customer-1" },
          ":placedAt": { S: "2026-01" },
        },
      },
    });

    // Then the two orders placed that month come back.
    assertIdentical(orderIds(page.Items).join(","), "order-02,order-04");
  });

  it("reads the collection backwards", async () => {
    // Given a table with a local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When the customer's orders are read backwards.
    const page = await simAws
      .dynamoDb()
      .query({ input: { ...firstCustomer, ScanIndexForward: false } });

    // Then the latest month comes first, by the index sort key.
    assertIdentical(orderIds(page.Items)[0], "order-01");
  });

  it("refuses a key condition on the table sort key", async () => {
    // Given a table with a local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When the index is queried by the attribute the table sorts on.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().query({
        input: {
          ...firstCustomer,
          KeyConditionExpression:
            "customerId = :customerId AND orderId = :orderId",
          ExpressionAttributeValues: {
            ":customerId": { S: "customer-1" },
            ":orderId": { S: "order-01" },
          },
        },
      }),
    );

    // Then it is refused: a key condition is held to the key being read, and
    // the index is sorted by placedAt.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "orderId is not part of");
  });

  it("refuses an index name the table does not have", async () => {
    // Given a table with one local secondary index.
    const simAws = new SimAws();
    await simDynamoDbLocallyIndexedTableFactory.make({}, simAws);

    // When a query names an index that is not there.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDb()
        .query({ input: { ...firstCustomer, IndexName: "byShippedAt" } }),
    );

    // Then it is refused rather than read as the table.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
    assertStringIncludes(
      error.message,
      "The table OrdersTable does not have the specified index: byShippedAt",
    );
  });
});

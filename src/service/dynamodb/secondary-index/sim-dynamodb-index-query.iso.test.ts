import { QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayIncludesAll,
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
import { simDynamoDbIndexedTableFactory } from "./sim-dynamodb-indexed-table.factory.js";

/**
 * The order ids a page came back with, so a test names items rather than places.
 */
function orderIds(
  items: readonly Readonly<Record<string, { S?: string }>>[] | undefined,
): readonly string[] {
  return (items ?? []).map((item) => item["orderId"]?.S ?? "");
}

describe("DynamoDB Query on a global secondary index", () => {
  it("reads an item collection of the index rather than the table", async () => {
    // Given a table with an index keyed on status and shipping month.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When the index is queried by its own partition key.
    const page = await simAws.dynamoDb().query(
      new QueryCommand({
        TableName: "OrdersTable",
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": { S: "OPEN" } },
      }),
    );

    // Then the open orders come back, which the table's own key could not have
    // named: the table is keyed by orderId alone.
    assertArrayLength(orderIds(page.Items), 2);
    assertArrayIncludesAll(orderIds(page.Items), ["order-01", "order-05"]);
  });

  it("leaves out an item missing an index key attribute", async () => {
    // Given a table whose orders do not all carry a status.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);
    const dynamoDb = simAws.dynamoDb();

    // When both statuses are read off the index.
    const open = await dynamoDb.query({
      input: {
        TableName: "OrdersTable",
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": { S: "OPEN" } },
      },
    });
    const shipped = await dynamoDb.query({
      input: {
        TableName: "OrdersTable",
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": { S: "SHIPPED" } },
      },
    });

    // Then the index holds four of the six orders. The other two carry no
    // status, so the index is simply missing them rather than the write having
    // been refused.
    assertIdentical((open.Count ?? 0) + (shipped.Count ?? 0), 4);
  });

  it("orders a collection by the index sort key", async () => {
    // Given a table with an index sorted by shipping month.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When the open orders are read backwards.
    const page = await simAws.dynamoDb().query({
      input: {
        TableName: "OrdersTable",
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": { S: "OPEN" } },
        ScanIndexForward: false,
      },
    });

    // Then the later shipping month comes first, by the index sort key rather
    // than by anything the table is keyed on.
    assertIdentical(orderIds(page.Items)[0], "order-05");
    assertIdentical(orderIds(page.Items)[1], "order-01");
  });

  it("takes a sort key condition on the index sort key", async () => {
    // Given a table with an index sorted by shipping month.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When the open orders are narrowed to the first month.
    const page = await simAws.dynamoDb().query({
      input: {
        TableName: "OrdersTable",
        IndexName: "byStatus",
        KeyConditionExpression:
          "#status = :status AND begins_with(shippedAt, :month)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": { S: "OPEN" },
          ":month": { S: "2026-01" },
        },
      },
    });

    // Then only the order shipped that month comes back.
    assertArrayLength(orderIds(page.Items), 1);
    assertIdentical(orderIds(page.Items)[0], "order-01");
  });

  it("refuses a key condition on an attribute outside the index key", async () => {
    // Given a table with an index keyed on something other than its own key.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When the index is queried by the table's partition key.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().query({
        input: {
          TableName: "OrdersTable",
          IndexName: "byStatus",
          KeyConditionExpression: "orderId = :orderId",
          ExpressionAttributeValues: { ":orderId": { S: "order-01" } },
        },
      }),
    );

    // Then it is refused: a key condition is held to the key being read, which
    // for a read of an index is the index's own.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "orderId is not part of");
  });

  it("refuses an index name the table does not have", async () => {
    // Given a table with one index.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When a query names an index that is not there.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().query({
        input: {
          TableName: "OrdersTable",
          IndexName: "byOwner",
          KeyConditionExpression: "#status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": { S: "OPEN" } },
        },
      }),
    );

    // Then it is refused rather than read as the table.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
    assertStringIncludes(
      error.message,
      "The table OrdersTable does not have the specified index: byOwner",
    );
  });

  it("refuses a consistent read of a global secondary index", async () => {
    // Given a table with an index.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When a query asks for a strongly consistent read of it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().query({
        input: {
          TableName: "OrdersTable",
          IndexName: "byStatus",
          ConsistentRead: true,
          KeyConditionExpression: "#status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": { S: "OPEN" } },
        },
      }),
    );

    // Then it is refused. A global secondary index is maintained
    // asynchronously on AWS, so it cannot answer one whatever the simulation
    // does.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Consistent reads are not supported on global secondary indexes",
    );
  });

  it("still reads the table for a request naming no index", async () => {
    // Given a table with an index.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When a query names no IndexName and asks for a consistent read.
    const page = await simAws.dynamoDb().query({
      input: {
        TableName: "OrdersTable",
        ConsistentRead: true,
        KeyConditionExpression: "orderId = :orderId",
        ExpressionAttributeValues: { ":orderId": { S: "order-03" } },
      },
    });

    // Then the table answers, including the order the index does not hold.
    assertArrayLength(orderIds(page.Items), 1);
    assertIdentical(orderIds(page.Items)[0], "order-03");
  });
});

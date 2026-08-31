import {
  CreateTableCommand,
  PutItemCommand,
  QueryCommand,
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
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import { SimDynamoDbResourceNotFoundException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimQueryCommandOutput } from "./query.command.js";

/**
 * A table keyed by customer and order, holding one customer's item collection
 * and one item belonging to another customer.
 *
 * The items are written out of order, so the order a query answers in is the
 * collection's rather than the order they arrived in.
 */
async function ordersTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDbCollectionTableFactory.make({}, simAws);

  await Promise.all(
    ["2026-03", "2026-01", "2027-01", "2026-02"].map(async (orderId) =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "OrdersTable",
          Item: { customerId: { S: "c-1" }, orderId: { S: orderId } },
        }),
      ),
    ),
  );

  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "OrdersTable",
      Item: { customerId: { S: "c-2" }, orderId: { S: "2026-01" } },
    }),
  );

  return simDynamoDb;
}

/**
 * The sort keys a page came back with, in the order they came back in.
 */
function orderIds(output: SimQueryCommandOutput): readonly string[] {
  return (output.Items ?? []).map((item) => item["orderId"]?.S ?? "");
}

describe("DynamoDB QueryCommand", () => {
  it("answers with the whole item collection in sort key order", async () => {
    // Given a table holding one customer's orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the collection is read by its partition key alone.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customer",
        ExpressionAttributeValues: { ":customer": { S: "c-1" } },
      }),
    );

    // Then every item under that partition key comes back in ascending sort
    // key order, and the other customer's order is not among them.
    assertArrayEquals(orderIds(output), [
      "2026-01",
      "2026-02",
      "2026-03",
      "2027-01",
    ]);
  });

  it("reads the collection backwards for ScanIndexForward false", async () => {
    // Given a table holding one customer's orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the collection is read backwards.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customer",
        ExpressionAttributeValues: { ":customer": { S: "c-1" } },
        ScanIndexForward: false,
      }),
    );

    // Then the same items come back in the opposite order.
    assertArrayEquals(orderIds(output), [
      "2027-01",
      "2026-03",
      "2026-02",
      "2026-01",
    ]);
  });

  it("counts the items it evaluated and the items it answered with", async () => {
    // Given a table holding one customer's orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When part of the collection is read.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression:
          "customerId = :customer AND begins_with(orderId, :prefix)",
        ExpressionAttributeValues: {
          ":customer": { S: "c-1" },
          ":prefix": { S: "2026-" },
        },
      }),
    );

    // Then both counts are the number of items answered with, since nothing
    // filters a query.
    assertIdentical(output.Count, 3);
    assertIdentical(output.ScannedCount, 3);
  });

  it("answers with the whole item rather than only its key", async () => {
    // Given a table holding an order carrying more than its key.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: {
          customerId: { S: "c-3" },
          orderId: { S: "2026-01" },
          total: { N: "19.99" },
        },
      }),
    );

    // When the collection is read.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customer",
        ExpressionAttributeValues: { ":customer": { S: "c-3" } },
      }),
    );

    // Then the attributes beyond the key come back too.
    const item = output.Items?.at(0);
    assertNonNullable(item);
    assertIdentical(item["total"]?.N, "19.99");
  });

  it("answers with an empty page for a partition key holding nothing", async () => {
    // Given a table holding orders for other customers.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a partition key nothing was written under is read.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customer",
        ExpressionAttributeValues: { ":customer": { S: "nobody" } },
      }),
    );

    // Then the page is empty rather than missing, and there is nothing to
    // resume from.
    assertArrayEmpty(output.Items ?? []);
    assertIdentical(output.Count, 0);
    assertUndefined(output.LastEvaluatedKey);
  });

  it("reads a table that has no sort key", async () => {
    // Given a table keyed by partition key alone.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "UsersTable",
        KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "userId", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "UsersTable",
        Item: { userId: { S: "user-1" }, note: { S: "first" } },
      }),
    );

    // When the partition key is queried.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "UsersTable",
        KeyConditionExpression: "userId = :user",
        ExpressionAttributeValues: { ":user": { S: "user-1" } },
      }),
    );

    // Then the one item under it comes back: a collection with no sort key
    // holds at most one.
    assertArrayLength(output.Items ?? [], 1);
    assertIdentical(output.Items?.at(0)?.["note"]?.S, "first");
  });

  it("reads a key attribute written as a name placeholder", async () => {
    // Given a table holding one customer's orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the key attributes are named through ExpressionAttributeNames.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "#customer = :customer AND #order > :after",
        ExpressionAttributeNames: {
          "#customer": "customerId",
          "#order": "orderId",
        },
        ExpressionAttributeValues: {
          ":customer": { S: "c-1" },
          ":after": { S: "2026-02" },
        },
      }),
    );

    // Then the placeholders stand for the key attributes.
    assertArrayEquals(orderIds(output), ["2026-03", "2027-01"]);
  });

  it.each([true, false])(
    "answers with the latest write for ConsistentRead %s",
    async (consistentRead) => {
      // Given a table holding one customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = await ordersTable(simAws);

      // When the collection is read either consistently or not.
      const output = await simDynamoDb.query(
        new QueryCommand({
          TableName: "OrdersTable",
          KeyConditionExpression: "customerId = :customer",
          ExpressionAttributeValues: { ":customer": { S: "c-1" } },
          ConsistentRead: consistentRead,
        }),
      );

      // Then every write is there either way: this simulation is always
      // strongly consistent.
      assertArrayLength(output.Items ?? [], 4);
    },
  );

  it("reads a collection by the table ARN", async () => {
    // Given a table holding one customer's orders.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);
    const description = await simDynamoDb.describeTable({
      input: { TableName: "OrdersTable" },
    });
    const tableArn = description.Table?.TableArn;
    assertNonNullable(tableArn);

    // When the collection is read by the table's ARN rather than its name.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: tableArn,
        KeyConditionExpression: "customerId = :customer",
        ExpressionAttributeValues: { ":customer": { S: "c-1" } },
      }),
    );

    // Then it is the same table.
    assertArrayLength(output.Items ?? [], 4);
  });

  it("reports a table that is not there", async () => {
    // Given a simulated DynamoDB with no tables.
    const simDynamoDb = new SimAws().dynamoDb();

    // When a collection is read from a table that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "MissingTable",
          KeyConditionExpression: "customerId = :customer",
          ExpressionAttributeValues: { ":customer": { S: "c-1" } },
        }),
      ),
    );

    // Then it is reported as not found.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });
});

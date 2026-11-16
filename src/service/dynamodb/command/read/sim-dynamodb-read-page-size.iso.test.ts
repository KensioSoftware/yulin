import {
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";

/**
 * About 300 KB of text, so four items take a page past 1 MB and three do not.
 */
const largeText = "x".repeat(300 * 1024);

/**
 * Put five large orders under one customer.
 */
async function putLargeOrders(simDynamoDb: SimDynamoDb): Promise<void> {
  for (const orderId of ["o-1", "o-2", "o-3", "o-4", "o-5"]) {
    // oxlint-disable-next-line no-await-in-loop -- the order of the puts does not matter, one at a time keeps memory down.
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: {
          customerId: { S: "c-1" },
          orderId: { S: orderId },
          status: { S: "open" },
          notes: { S: largeText },
        },
      }),
    );
  }
}

/**
 * The order IDs a page answered with.
 */
function orderIdsOf(
  items: readonly Record<string, SimDynamoDbAttributeValue>[] | undefined,
): readonly string[] {
  return (items ?? []).map((item) => item["orderId"]?.S ?? "");
}

describe("DynamoDB Query and Scan page size", () => {
  it("stops a query page once it has read more than 1 MB", async () => {
    // Given five orders of about 300 KB each under one customer.
    const simAws = new SimAws();
    await simDynamoDbCollectionTableFactory.make({}, simAws);
    const simDynamoDb = simAws.dynamoDb();
    await putLargeOrders(simDynamoDb);

    // When the customer's orders are queried with no Limit.
    const first = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :c",
        ExpressionAttributeValues: { ":c": { S: "c-1" } },
      }),
    );

    // Then the page holds the three items that fit in 1 MB and says where to
    // resume.
    assertArrayEquals(orderIdsOf(first.Items), ["o-1", "o-2", "o-3"]);
    const token = first.LastEvaluatedKey;
    assertNonNullable(token);
    assertIdentical(token["orderId"]?.S, "o-3");

    // And resuming from it reads the rest with no token after it.
    const second = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :c",
        ExpressionAttributeValues: { ":c": { S: "c-1" } },
        ExclusiveStartKey: token,
      }),
    );

    assertArrayEquals(orderIdsOf(second.Items), ["o-4", "o-5"]);
    assertUndefined(second.LastEvaluatedKey);
  });

  it("counts the 1 MB before a filter drops anything", async () => {
    // Given five orders of about 300 KB each, all of them open.
    const simAws = new SimAws();
    await simDynamoDbCollectionTableFactory.make({}, simAws);
    const simDynamoDb = simAws.dynamoDb();
    await putLargeOrders(simDynamoDb);

    // When a scan filters for closed orders.
    const page = await simDynamoDb.scan(
      new ScanCommand({
        TableName: "OrdersTable",
        FilterExpression: "#status = :closed",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":closed": { S: "closed" } },
      }),
    );

    // Then the page answers with nothing, having read three items, and still
    // hands out a token to resume from.
    assertIdentical(page.Count, 0);
    assertIdentical(page.ScannedCount, 3);
    assertNonNullable(page.LastEvaluatedKey);
  });

  it("stops at the Limit when that comes before 1 MB", async () => {
    // Given five orders of about 300 KB each.
    const simAws = new SimAws();
    await simDynamoDbCollectionTableFactory.make({}, simAws);
    const simDynamoDb = simAws.dynamoDb();
    await putLargeOrders(simDynamoDb);

    // When a scan asks for two of them.
    const page = await simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable", Limit: 2 }),
    );

    // Then the Limit decides the page.
    assertIdentical(page.ScannedCount, 2);
    assertNonNullable(page.LastEvaluatedKey);
  });

  it("counts what an index projects rather than the whole item", async () => {
    // Given five large orders on a table whose index projects only keys.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable({
      input: {
        TableName: "OrdersTable",
        KeySchema: [
          { AttributeName: "customerId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "customerId", AttributeType: "S" },
          { AttributeName: "orderId", AttributeType: "S" },
          { AttributeName: "status", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: "ByStatus",
            KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
            Projection: { ProjectionType: "KEYS_ONLY" },
          },
        ],
        BillingMode: "PAY_PER_REQUEST",
      },
    });
    await simAws.backgroundTasksComplete();
    await putLargeOrders(simDynamoDb);

    // When the index is queried with no Limit.
    const page = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        IndexName: "ByStatus",
        KeyConditionExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":open": { S: "open" } },
      }),
    );

    // Then every order fits in one page, since the index holds none of the
    // large attribute.
    assertIdentical(page.Count, 5);
    assertUndefined(page.LastEvaluatedKey);
  });

  it("counts the whole item when a local index read fetches from the table", async () => {
    // Given five large orders on a table whose local index projects only keys.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable({
      input: {
        TableName: "OrdersTable",
        KeySchema: [
          { AttributeName: "customerId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "customerId", AttributeType: "S" },
          { AttributeName: "orderId", AttributeType: "S" },
          { AttributeName: "status", AttributeType: "S" },
        ],
        LocalSecondaryIndexes: [
          {
            IndexName: "ByStatus",
            KeySchema: [
              { AttributeName: "customerId", KeyType: "HASH" },
              { AttributeName: "status", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "KEYS_ONLY" },
          },
        ],
        BillingMode: "PAY_PER_REQUEST",
      },
    });
    await simAws.backgroundTasksComplete();
    await putLargeOrders(simDynamoDb);

    // When the index is queried for an attribute it leaves out.
    const page = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        IndexName: "ByStatus",
        KeyConditionExpression: "customerId = :c",
        ExpressionAttributeValues: { ":c": { S: "c-1" } },
        ProjectionExpression: "orderId, notes",
      }),
    );

    // Then each item fetched from the table counts whole, and the page stops
    // at 1 MB.
    assertIdentical(page.Count, 3);
    assertNonNullable(page.LastEvaluatedKey);
  });
});

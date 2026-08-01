import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";
import type { SimQueryCommandOutput } from "./query.command.js";

/**
 * A table holding one customer's three orders.
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

  return simDynamoDb;
}

/**
 * Read one page of the collection, resuming after a token when there is one.
 *
 * The token goes straight back the way a caller passes it, rather than being
 * rebuilt, since that is what a paging loop does.
 */
async function queryPage(
  simDynamoDb: SimDynamoDb,
  limit: number | undefined,
  exclusiveStartKey?: Readonly<Record<string, SimDynamoDbAttributeValue>>,
): Promise<SimQueryCommandOutput> {
  return await simDynamoDb.query({
    input: {
      TableName: "OrdersTable",
      KeyConditionExpression: "customerId = :customer",
      ExpressionAttributeValues: { ":customer": { S: "c-1" } },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    },
  });
}

/**
 * The sort keys a page came back with, in the order they came back in.
 */
function orderIds(output: SimQueryCommandOutput): readonly string[] {
  return (output.Items ?? []).map((item) => item["orderId"]?.S ?? "");
}

describe("DynamoDB QueryCommand paging", () => {
  it("stops a page at the Limit and says where to resume", async () => {
    // Given a table holding three orders for one customer.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When two of them are asked for.
    const output = await queryPage(simDynamoDb, 2);

    // Then the page stops at the limit, and the token names the item it
    // stopped on.
    assertArrayEquals(orderIds(output), ["order-1", "order-2"]);

    const token = output.LastEvaluatedKey;
    assertNonNullable(token);
    assertIdentical(token["orderId"]?.S, "order-2");
    assertIdentical(token["customerId"]?.S, "c-1");
  });

  it("leaves the token off when the collection ran out inside the Limit", async () => {
    // Given a table holding three orders for one customer.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When more than the collection holds is asked for.
    const output = await queryPage(simDynamoDb, 10);

    // Then the whole collection comes back with nothing left to resume for.
    assertArrayLength(output.Items ?? [], 3);
    assertUndefined(output.LastEvaluatedKey);
  });

  it("hands out a token even when the Limit fell on the last item", async () => {
    // Given a table holding three orders for one customer.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When exactly as many as the collection holds are asked for.
    const output = await queryPage(simDynamoDb, 3);

    // Then there is still a token, since the walk stopped at the limit rather
    // than at the end of the range.
    assertArrayLength(output.Items ?? [], 3);
    assertNonNullable(output.LastEvaluatedKey);

    // And the next page is empty, with nothing left to resume for.
    const next = await queryPage(simDynamoDb, 3, output.LastEvaluatedKey);

    assertArrayLength(next.Items ?? [], 0);
    assertUndefined(next.LastEvaluatedKey);
  });

  it("reads the whole collection when no Limit is given", async () => {
    // Given a table holding three orders for one customer.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When the collection is read with no page size at all.
    const output = await queryPage(simDynamoDb, undefined);

    // Then everything comes back: nothing here stops a page at 1 MB.
    assertArrayLength(output.Items ?? [], 3);
    assertUndefined(output.LastEvaluatedKey);
  });

  it("empties the page of a table with no sort key once resumed", async () => {
    // Given a table keyed by partition key alone, holding one item.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "UsersTable", partitionKeyName: "userId" },
      simAws,
    );

    await simDynamoDb.putItem({
      input: {
        TableName: "UsersTable",
        Item: { userId: { S: "user-1" } },
      },
    });

    // When the query resumes after that item.
    const output = await simDynamoDb.query({
      input: {
        TableName: "UsersTable",
        KeyConditionExpression: "userId = :user",
        ExpressionAttributeValues: { ":user": { S: "user-1" } },
        ExclusiveStartKey: { userId: { S: "user-1" } },
      },
    });

    // Then there is nothing after it: a collection with no sort key holds one
    // item.
    assertArrayLength(output.Items ?? [], 0);
  });
});

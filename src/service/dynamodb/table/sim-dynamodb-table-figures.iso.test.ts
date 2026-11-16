import {
  CreateTableCommand,
  DeleteItemCommand,
  DescribeTableCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * A table of orders with a keys-only index on status.
 */
async function ordersByStatus(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.dynamoDb().createTable(
    new CreateTableCommand({
      TableName: "orders",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "orderId", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: [
        {
          IndexName: "byStatus",
          KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
          Projection: { ProjectionType: "KEYS_ONLY" },
        },
      ],
    }),
  );
  await simAws.backgroundTasksComplete();

  return simAws;
}

/**
 * Put an order. One with a status is 30 bytes, and its entry in the index 24.
 * One without is 20 bytes, and has no entry.
 */
async function putOrder(
  simAws: SimAws,
  orderId: string,
  status?: string,
): Promise<void> {
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "orders",
      Item: {
        orderId: { S: orderId },
        notes: { S: "x" },
        ...(status !== undefined && { status: { S: status } }),
      },
    }),
  );
}

/**
 * The orders table as DescribeTable reports it.
 */
async function describeOrders(simAws: SimAws) {
  const described = await simAws
    .dynamoDb()
    .describeTable(new DescribeTableCommand({ TableName: "orders" }));
  assertNonNullable(described.Table);

  return described.Table;
}

describe("DynamoDB table ItemCount and TableSizeBytes", () => {
  it("reports nothing until the first refresh, six hours in", async () => {
    // Given a new table, and two orders put in it.
    const simAws = await ordersByStatus();
    await putOrder(simAws, "order-1", "open");
    await putOrder(simAws, "order-2", "open");

    // When it is described straight away, then it reports no items.
    const fresh = await describeOrders(simAws);
    assertIdentical(fresh.ItemCount, 0);

    // When six hours pass, then it reports both, and their bytes.
    await simAws.clock().advanceBy({ hours: 6 });
    const table = await describeOrders(simAws);
    assertIdentical(table.ItemCount, 2);
    assertIdentical(table.TableSizeBytes, 60);
  });

  it("reports the items as they stood at the last refresh", async () => {
    // Given a table holding one order at its first refresh.
    const simAws = await ordersByStatus();
    await putOrder(simAws, "order-1", "open");
    await simAws.clock().advanceBy({ hours: 7 });

    // When another order is put and the first is deleted, an hour after it.
    await putOrder(simAws, "order-2", "open");
    await simAws.dynamoDb().deleteItem(
      new DeleteItemCommand({
        TableName: "orders",
        Key: { orderId: { S: "order-1" } },
      }),
    );

    // Then the table still reports the one order it held at six hours.
    const lagging = await describeOrders(simAws);
    assertIdentical(lagging.ItemCount, 1);

    // And reports the change once the next refresh falls, at twelve.
    await simAws.clock().advanceBy({ hours: 5 });
    const table = await describeOrders(simAws);
    assertIdentical(table.ItemCount, 1);
    assertIdentical(table.TableSizeBytes, 30);
  });

  it("counts only the items an index holds, at the size it holds them", async () => {
    // Given a table holding two orders with a status and one without.
    const simAws = await ordersByStatus();
    await putOrder(simAws, "order-1", "open");
    await putOrder(simAws, "order-2", "open");
    await putOrder(simAws, "order-3");

    // When the table is described after its first refresh.
    await simAws.clock().advanceBy({ hours: 6 });
    const table = await describeOrders(simAws);

    // Then the table counts all three, and the index the two it holds.
    assertIdentical(table.ItemCount, 3);
    const index = table.GlobalSecondaryIndexes?.[0];
    assertObjectEquals(
      { ItemCount: index?.ItemCount, IndexSizeBytes: index?.IndexSizeBytes },
      { ItemCount: 2, IndexSizeBytes: 48 },
    );
  });
});

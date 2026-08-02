import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";
import type { CreateGlobalSecondaryIndexAction } from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";

/**
 * The `Create` a test hands to UpdateTable, indexing orders by status.
 */
const byStatusIndex: CreateGlobalSecondaryIndexAction = {
  IndexName: "byStatus",
  KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
  Projection: { ProjectionType: "ALL" },
};

/**
 * A table holding one order, with no secondary index on it yet.
 */
async function ordersWithoutIndex(simAws: SimAws): Promise<void> {
  await simAws.dynamoDb().createTable(
    new CreateTableCommand({
      TableName: "orders",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.backgroundTasksComplete();

  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "orders",
      Item: { orderId: { S: "order-1" }, status: { S: "OPEN" } },
    }),
  );
}

/**
 * Add the `byStatus` index to a table, declaring the attribute it is keyed on.
 */
async function addByStatus(simAws: SimAws): Promise<void> {
  await simAws.dynamoDb().updateTable(
    new UpdateTableCommand({
      TableName: "orders",
      AttributeDefinitions: [{ AttributeName: "status", AttributeType: "S" }],
      GlobalSecondaryIndexUpdates: [{ Create: byStatusIndex }],
    }),
  );
}

describe("DynamoDB UpdateTableCommand secondary indexes", () => {
  it("reports a new index as CREATING and backfilling", async () => {
    // Given a live table with no index on it.
    const simAws = new SimAws();
    await ordersWithoutIndex(simAws);

    // When an index is added.
    await addByStatus(simAws);

    const updated = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    // Then it is on the table, still being built and filling with the items
    // that were already there.
    assertNonNullable(updated.Table);
    assertArrayLength(updated.Table.GlobalSecondaryIndexes, 1);
    assertIdentical(
      updated.Table.GlobalSecondaryIndexes[0].IndexStatus,
      "CREATING",
    );
    assertTrue(updated.Table.GlobalSecondaryIndexes[0].Backfilling);
    assertIdentical(updated.Table.TableStatus, "UPDATING");
  });

  it("refuses a query against an index that is still being built", async () => {
    // Given a table with an index that has just been added.
    const simAws = new SimAws();
    await ordersWithoutIndex(simAws);
    await addByStatus(simAws);

    // When the new index is queried, then the read is refused, since real
    // DynamoDB will not answer from a partly built index.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().query(
        new QueryCommand({
          TableName: "orders",
          IndexName: "byStatus",
          KeyConditionExpression: "#status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": { S: "OPEN" } },
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(
      error.message,
      "Cannot read from backfilling global secondary index: byStatus",
    );
  });

  it("refuses a scan of an index that is still being built", async () => {
    // Given the same table.
    const simAws = new SimAws();
    await ordersWithoutIndex(simAws);
    await addByStatus(simAws);

    // When the new index is scanned, then the read is refused the same way.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .dynamoDb()
        .scan(new ScanCommand({ TableName: "orders", IndexName: "byStatus" }));
    });

    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it("answers for items written before the index existed", async () => {
    // Given a table whose index was added after an order was written.
    const simAws = new SimAws();
    await ordersWithoutIndex(simAws);
    await addByStatus(simAws);

    // When the index has finished being built.
    await simAws.backgroundTasksComplete();

    // Then it is ACTIVE, reports no backfilling, and holds the order that was
    // already there, which is what backfilling gets to on AWS.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table);
    assertArrayLength(described.Table.GlobalSecondaryIndexes, 1);
    assertIdentical(
      described.Table.GlobalSecondaryIndexes[0].IndexStatus,
      "ACTIVE",
    );
    assertUndefined(described.Table.GlobalSecondaryIndexes[0].Backfilling);
    assertIdentical(described.Table.TableStatus, "ACTIVE");

    const open = await simAws.dynamoDb().query(
      new QueryCommand({
        TableName: "orders",
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": { S: "OPEN" } },
      }),
    );

    assertIdentical(open.Count, 1);
    assertIdentical(open.Items?.[0]?.["orderId"]?.S, "order-1");
  });

  it("leaves the indexes a table already had ACTIVE while a new one builds", async () => {
    // Given a table that already carries an index.
    const simAws = new SimAws();
    await simAws.dynamoDb().createTable(
      new CreateTableCommand({
        TableName: "orders",
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
          { AttributeName: "customerId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        GlobalSecondaryIndexes: [
          {
            IndexName: "byCustomer",
            KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      }),
    );
    await simAws.backgroundTasksComplete();

    // When a second index is added.
    await addByStatus(simAws);

    // Then the index that was already there is still ACTIVE and still readable,
    // since only the new one is being built.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table);
    assertArrayLength(described.Table.GlobalSecondaryIndexes, 2);
    assertIdentical(
      described.Table.GlobalSecondaryIndexes[0].IndexName,
      "byCustomer",
    );
    assertIdentical(
      described.Table.GlobalSecondaryIndexes[0].IndexStatus,
      "ACTIVE",
    );
    assertUndefined(described.Table.GlobalSecondaryIndexes[0].Backfilling);

    const byCustomer = await simAws.dynamoDb().query(
      new QueryCommand({
        TableName: "orders",
        IndexName: "byCustomer",
        KeyConditionExpression: "customerId = :customerId",
        ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
      }),
    );
    assertIdentical(byCustomer.Count, 0);
  });

  it("takes an unchanged attribute definition again without complaint", async () => {
    // Given a live table, and an update restating the definition the table
    // already has alongside the one the new index needs, as a template
    // deploying the whole table would.
    const simAws = new SimAws();
    await ordersWithoutIndex(simAws);

    // When the index is added.
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
          { AttributeName: "status", AttributeType: "S" },
        ],
        GlobalSecondaryIndexUpdates: [{ Create: byStatusIndex }],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the table defines each attribute once, since restating one that
    // already matches adds nothing.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertArrayLength(described.Table?.AttributeDefinitions, 2);
  });

  it("removes an index from the table", async () => {
    // Given a table with an ACTIVE index on it.
    const simAws = new SimAws();
    await ordersWithoutIndex(simAws);
    await addByStatus(simAws);
    await simAws.backgroundTasksComplete();

    // When the index is deleted.
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        GlobalSecondaryIndexUpdates: [{ Delete: { IndexName: "byStatus" } }],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the table no longer describes it.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertUndefined(described.Table?.GlobalSecondaryIndexes);

    // And a query naming it is refused as a read of an index that is not there.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().query(
        new QueryCommand({
          TableName: "orders",
          IndexName: "byStatus",
          KeyConditionExpression: "#status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": { S: "OPEN" } },
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });

  it("reports every index as DELETING while the table is deleted", async () => {
    // Given a table carrying an ACTIVE index.
    const simAws = new SimAws();
    await ordersWithoutIndex(simAws);
    await addByStatus(simAws);
    await simAws.backgroundTasksComplete();

    // When the table is deleted.
    const deleted = await simAws
      .dynamoDb()
      .deleteTable(new DeleteTableCommand({ TableName: "orders" }));

    // Then the index goes with it, whatever it was doing of its own.
    assertNonNullable(deleted.TableDescription);
    assertArrayLength(deleted.TableDescription.GlobalSecondaryIndexes, 1);
    assertIdentical(
      deleted.TableDescription.GlobalSecondaryIndexes[0].IndexStatus,
      "DELETING",
    );

    await simAws.backgroundTasksComplete();
  });

  it("keeps the table readable while an index is being removed", async () => {
    // Given a table part way through an index deletion.
    const simAws = new SimAws();
    await ordersWithoutIndex(simAws);
    await addByStatus(simAws);
    await simAws.backgroundTasksComplete();
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        GlobalSecondaryIndexUpdates: [{ Delete: { IndexName: "byStatus" } }],
      }),
    );

    // When the table itself is scanned, then it answers as it did before.
    const scanned = await simAws
      .dynamoDb()
      .scan(new ScanCommand({ TableName: "orders" }));

    assertIdentical(scanned.Count, 1);
  });
});

import {
  CreateTableCommand,
  DescribeTableCommand,
  GetItemCommand,
  PutItemCommand,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

/**
 * A provisioned table to reprovision, which an on-demand one cannot be.
 */
async function provisionedOrders(simAws: SimAws): Promise<void> {
  await simAws.dynamoDb().createTable(
    new CreateTableCommand({
      TableName: "orders",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      BillingMode: "PROVISIONED",
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    }),
  );
  await simAws.backgroundTasksComplete();
}

describe("DynamoDB UpdateTableCommand", () => {
  it("takes the table through UPDATING and back to ACTIVE", async () => {
    // Given an ACTIVE table.
    const simAws = new SimAws();
    await provisionedOrders(simAws);

    // When its capacity is changed.
    const updated = await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        ProvisionedThroughput: { ReadCapacityUnits: 9, WriteCapacityUnits: 7 },
      }),
    );

    // Then the response describes an UPDATING table, as AWS answers while the
    // change is still in progress.
    assertIdentical(updated.TableDescription?.TableStatus, "UPDATING");

    // And it settles back to ACTIVE once the scheduled work has run.
    await simAws.backgroundTasksComplete();

    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table);
    assertIdentical(described.Table.TableStatus, "ACTIVE");
    assertNonNullable(described.Table.ProvisionedThroughput);
    assertIdentical(described.Table.ProvisionedThroughput.ReadCapacityUnits, 9);
    assertIdentical(
      described.Table.ProvisionedThroughput.WriteCapacityUnits,
      7,
    );
  });

  it("serves reads and writes while the table is UPDATING", async () => {
    // Given a table part way through an update.
    const simAws = new SimAws();
    await provisionedOrders(simAws);
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        ProvisionedThroughput: { ReadCapacityUnits: 9, WriteCapacityUnits: 7 },
      }),
    );

    // When an item is written and read back before the update settles.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-1" }, total: { N: "42" } },
      }),
    );
    const read = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: "orders",
        Key: { orderId: { S: "order-1" } },
      }),
    );

    // Then both go through, since AWS does not take a table offline to update
    // it.
    assertIdentical(read.Item?.["total"]?.N, "42");
    assertIdentical(simAws.dynamoDb().findTable("orders")?.status, "UPDATING");
  });

  it("switches a table from on-demand to provisioned capacity", async () => {
    // Given an on-demand table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);

    // When it is switched to provisioned capacity.
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        BillingMode: "PROVISIONED",
        ProvisionedThroughput: { ReadCapacityUnits: 3, WriteCapacityUnits: 2 },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the table reports the new mode and the capacity it was given.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table);
    assertIdentical(
      described.Table.BillingModeSummary?.BillingMode,
      "PROVISIONED",
    );
    assertIdentical(
      described.Table.ProvisionedThroughput?.ReadCapacityUnits,
      3,
    );
  });

  it("switches a provisioned table to on-demand", async () => {
    // Given a provisioned table.
    const simAws = new SimAws();
    await provisionedOrders(simAws);

    // When it is switched to on-demand, which has no capacity to state.
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the table is billed the new way and reports no capacity.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table);
    assertIdentical(
      described.Table.BillingModeSummary?.BillingMode,
      "PAY_PER_REQUEST",
    );
    assertIdentical(
      described.Table.ProvisionedThroughput?.ReadCapacityUnits,
      0,
    );
  });

  it("changes the table class", async () => {
    // Given a table with no class of its own.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);

    // When it is moved to the infrequent access class.
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        TableClass: "STANDARD_INFREQUENT_ACCESS",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then it reports the class it was moved to.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertIdentical(
      described.Table?.TableClassSummary?.TableClass,
      "STANDARD_INFREQUENT_ACCESS",
    );
  });

  it("protects a table from deletion and stops protecting it", async () => {
    // Given an unprotected table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);

    // When deletion protection is switched on.
    const protectedTable = await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        DeletionProtectionEnabled: true,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the table reports it, and a delete would now be refused.
    assertTrue(protectedTable.TableDescription?.DeletionProtectionEnabled);

    // And switching it off again leaves the table deletable.
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        DeletionProtectionEnabled: false,
      }),
    );
    await simAws.backgroundTasksComplete();

    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));

    assertNonNullable(described.Table);
    assertFalse(described.Table.DeletionProtectionEnabled);
  });

  it("leaves the billing mode summary alone when only capacity changes", async () => {
    // Given a table created without naming a billing mode, which reports no
    // billing mode summary.
    const simAws = new SimAws();
    await simAws.dynamoDb().createTable(
      new CreateTableCommand({
        TableName: "orders",
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When its capacity alone is changed.
    const updated = await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        ProvisionedThroughput: { ReadCapacityUnits: 4, WriteCapacityUnits: 4 },
      }),
    );

    // Then it is still a table whose request named no mode, since this one did
    // not name one either.
    assertNonNullable(updated.TableDescription);
    assertUndefined(updated.TableDescription.BillingModeSummary);
    assertIdentical(
      updated.TableDescription.ProvisionedThroughput?.ReadCapacityUnits,
      4,
    );
  });
});

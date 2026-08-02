import {
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";
import type { CreateGlobalSecondaryIndexAction } from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbResourceInUseException,
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

/**
 * The `Create` a test hands to UpdateTable, indexing orders by status.
 */
const byStatusIndex: CreateGlobalSecondaryIndexAction = {
  IndexName: "byStatus",
  KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
  Projection: { ProjectionType: "ALL" },
};

describe("DynamoDB UpdateTableCommand validation", () => {
  it("refuses a throughput change and an index update together", async () => {
    // Given a provisioned table.
    const simAws = new SimAws();
    await simAws.dynamoDb().createTable(
      new CreateTableCommand({
        TableName: "orders",
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PROVISIONED",
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When one request asks for both, then it is refused, since AWS does one
    // of them at a time.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          ProvisionedThroughput: {
            ReadCapacityUnits: 2,
            WriteCapacityUnits: 2,
          },
          AttributeDefinitions: [
            { AttributeName: "status", AttributeType: "S" },
          ],
          GlobalSecondaryIndexUpdates: [{ Create: byStatusIndex }],
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "UpdateTable does one thing at a time");

    // And the table is left as it was.
    assertIdentical(simAws.dynamoDb().findTable("orders")?.status, "ACTIVE");
  });

  it("refuses two index updates in one request", async () => {
    // Given a table with an index on it.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);

    // When one request creates one index and deletes another, then it is
    // refused.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          AttributeDefinitions: [
            { AttributeName: "status", AttributeType: "S" },
          ],
          GlobalSecondaryIndexUpdates: [
            { Create: byStatusIndex },
            { Delete: { IndexName: "byCustomer" } },
          ],
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "You can create or delete only one global secondary index per " +
        "UpdateTable operation",
    );
  });

  it("refuses an entry that does not name exactly one action", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);

    // When an entry names none of Create, Delete or Update, then it is
    // refused.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          GlobalSecondaryIndexUpdates: [{}],
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "names exactly one of Create, Delete or Update",
    );
  });

  it("refuses an index whose key attribute is not declared on the same call", async () => {
    // Given a table with no definition for the attribute the index is keyed
    // on.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);

    // When the index is added without declaring it, then it is refused, since
    // UpdateTable is the only chance to declare it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          GlobalSecondaryIndexUpdates: [{ Create: byStatusIndex }],
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The KeySchema for index byStatus names the attribute status, which " +
        "has no AttributeDefinition",
    );

    // And nothing about the table changed.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));
    assertNonNullable(described.Table);
    assertIdentical(described.Table.TableStatus, "ACTIVE");
    assertArrayLength(described.Table.AttributeDefinitions, 1);
  });

  it("refuses redeclaring an attribute the table defines as another type", async () => {
    // Given a table keyed by a string.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "orders", partitionKeyName: "orderId" },
      simAws,
    );

    // When an update redefines that attribute as a number, then it is refused.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          AttributeDefinitions: [
            { AttributeName: "orderId", AttributeType: "N" },
          ],
          GlobalSecondaryIndexUpdates: [
            {
              Create: {
                IndexName: "byOrder",
                KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
                Projection: { ProjectionType: "ALL" },
              },
            },
          ],
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "redefines the attribute orderId as N, and the table already defines " +
        "it as S",
    );
  });

  it("refuses an index whose name the table already uses", async () => {
    // Given a table already carrying an index of that name.
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
        GlobalSecondaryIndexes: [byStatusIndex],
      }),
    );
    await simAws.backgroundTasksComplete();

    // When a second index of the same name is added, then it is refused.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          GlobalSecondaryIndexUpdates: [{ Create: byStatusIndex }],
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "names an index more than once");
  });

  it("refuses deleting an index the table does not have", async () => {
    // Given a table with no indexes.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);

    // When an index that is not there is deleted, then it is not found.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          GlobalSecondaryIndexUpdates: [{ Delete: { IndexName: "byStatus" } }],
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
    assertStringIncludes(
      error.message,
      "does not have the specified global secondary index: byStatus",
    );
  });

  it("refuses a second update while one is in flight", async () => {
    // Given a table part way through an update.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        TableClass: "STANDARD_INFREQUENT_ACCESS",
      }),
    );

    // When a second update arrives before the first has settled, then it is
    // refused, as AWS refuses one against an UPDATING table.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          DeletionProtectionEnabled: true,
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbResourceInUseException);
    assertStringIncludes(
      error.message,
      "Table orders is UPDATING and cannot be updated until it is ACTIVE",
    );

    // And once the first has settled, the second goes through.
    await simAws.backgroundTasksComplete();
    const updated = await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        DeletionProtectionEnabled: true,
      }),
    );
    assertNonNullable(updated.TableDescription);
  });

  it("refuses a request that asks for nothing", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);

    // When an update names only the table, then it is refused rather than
    // taking the table through UPDATING for no change.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .dynamoDb()
        .updateTable(new UpdateTableCommand({ TableName: "orders" }));
    });

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "changes none of them");
  });

  it("refuses capacity on a table that is billed per request", async () => {
    // Given an on-demand table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);

    // When capacity alone is set on it, then it is refused, since the request
    // does not switch it to provisioned billing.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          ProvisionedThroughput: {
            ReadCapacityUnits: 2,
            WriteCapacityUnits: 2,
          },
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Neither ReadCapacityUnits nor WriteCapacityUnits can be specified " +
        "when BillingMode is PAY_PER_REQUEST",
    );
  });

  it("refuses an update to a table that does not exist", async () => {
    // Given a simulated DynamoDB with no tables.
    const simAws = new SimAws();

    // When a table that is not there is updated, then it is not found.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          DeletionProtectionEnabled: true,
        }),
      );
    });

    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });
});

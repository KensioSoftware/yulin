import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimDynamoDbResourceInUseException,
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * Create one active table, ready to be deleted.
 */
async function activeTable(
  simAws: SimAws,
  input: {
    readonly TableName: string;
    readonly protectedFromDeletion?: boolean;
  },
): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDb.createTable(
    new CreateTableCommand({
      TableName: input.TableName,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
      DeletionProtectionEnabled: input.protectedFromDeletion ?? false,
    }),
  );
  await simAws.backgroundTasksComplete();

  return simDynamoDb;
}

describe("DynamoDB DeleteTableCommand", () => {
  it("deletes an active table, taking its items with it", async () => {
    // Given an active table with an item on it.
    const simAws = new SimAws();
    const simDynamoDb = await activeTable(simAws, { TableName: "FoobarTable" });
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FoobarTable",
        Item: { id: { S: "abc" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the table is deleted.
    const deletion = await simDynamoDb.deleteTable(
      new DeleteTableCommand({ TableName: "FoobarTable" }),
    );

    // Then it reports itself as deleting, and is gone once that has run.
    const deletedTable = deletion.TableDescription;
    assertNonNullable(deletedTable);
    assertIdentical(deletedTable.TableStatus, "DELETING");
    assertIdentical(deletedTable.TableName, "FoobarTable");

    await simAws.backgroundTasksComplete();

    const listing = await simDynamoDb.listTables(new ListTablesCommand());
    assertArrayEquals(listing.TableNames, []);

    const itemWrite = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "FoobarTable",
          Item: { id: { S: "def" } },
        }),
      ),
    );
    assertInstanceOf(itemWrite, SimDynamoDbResourceNotFoundException);
  });

  it("describes a table that is still deleting", async () => {
    // Given an active table that has been deleted.
    const simAws = new SimAws();
    const simDynamoDb = await activeTable(simAws, { TableName: "FoobarTable" });
    await simDynamoDb.deleteTable(
      new DeleteTableCommand({ TableName: "FoobarTable" }),
    );

    // When it is described before the deletion has run.
    const description = await simDynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "FoobarTable" }),
    );

    // Then it is still there, on its way out.
    assertIdentical(description.Table?.TableStatus, "DELETING");

    await simAws.backgroundTasksComplete();
  });

  it("takes a second delete of a table already deleting", async () => {
    // Given a table that is already deleting.
    const simAws = new SimAws();
    const simDynamoDb = await activeTable(simAws, { TableName: "FoobarTable" });
    await simDynamoDb.deleteTable(
      new DeleteTableCommand({ TableName: "FoobarTable" }),
    );

    // When it is deleted again.
    const deletion = await simDynamoDb.deleteTable(
      new DeleteTableCommand({ TableName: "FoobarTable" }),
    );

    // Then the request asks for a state the table is already heading to, so it
    // is not an error.
    assertIdentical(deletion.TableDescription?.TableStatus, "DELETING");

    await simAws.backgroundTasksComplete();
  });

  it("refuses to delete a table that is still being created", async () => {
    // Given a table that has not finished being created.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FoobarTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    // When it is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.deleteTable(
        new DeleteTableCommand({ TableName: "FoobarTable" }),
      ),
    );

    // Then the table is reported as in use until it is active.
    assertInstanceOf(error, SimDynamoDbResourceInUseException);
    assertStringIncludes(error.message, "is CREATING");

    await simAws.backgroundTasksComplete();
  });

  it("refuses to delete a table that is protected from deletion", async () => {
    // Given an active table with deletion protection on.
    const simAws = new SimAws();
    const simDynamoDb = await activeTable(simAws, {
      TableName: "FoobarTable",
      protectedFromDeletion: true,
    });

    // When it is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.deleteTable(
        new DeleteTableCommand({ TableName: "FoobarTable" }),
      ),
    );

    // Then it is refused, and the table stays as it was.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "DeletionProtection is enabled");

    await simAws.backgroundTasksComplete();

    const description = await simDynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "FoobarTable" }),
    );
    assertIdentical(description.Table?.TableStatus, "ACTIVE");
  });

  it("deletes a table named by its ARN", async () => {
    // Given an active table in a known Account and Region.
    const simAws = new SimAws();
    const simDynamoDb = simAws
      .account("666666666666")
      .region("eu-west-2")
      .dynamoDb();
    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FoobarTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.backgroundTasksComplete();

    // When it is deleted by its ARN.
    const deletion = await simDynamoDb.deleteTable(
      new DeleteTableCommand({
        TableName: "arn:aws:dynamodb:eu-west-2:666666666666:table/FoobarTable",
      }),
    );

    // Then it is the same table that goes.
    assertIdentical(deletion.TableDescription?.TableStatus, "DELETING");

    await simAws.backgroundTasksComplete();

    const listing = await simDynamoDb.listTables(new ListTablesCommand());
    assertArrayEquals(listing.TableNames, []);
  });

  it("refuses an unauthorized caller before looking the table up", async () => {
    // Given an active table, and a caller with no DynamoDB permissions.
    const simAws = new SimAws();
    const simDynamoDb = await activeTable(simAws, { TableName: "FoobarTable" });

    // When that caller deletes the table.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.deleteTable(
        new DeleteTableCommand({ TableName: "FoobarTable" }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then it is denied, and the table is still there.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:DeleteTable");

    const description = await simDynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "FoobarTable" }),
    );
    assertIdentical(description.Table?.TableStatus, "ACTIVE");
  });

  it("reports a table that is not there", async () => {
    // Given a simulated DynamoDB with no tables.
    const simDynamoDb = new SimAws().dynamoDb();

    // When a table that does not exist is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.deleteTable(
        new DeleteTableCommand({ TableName: "NonExistentTable" }),
      ),
    );

    // Then it is reported as not found.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });
});

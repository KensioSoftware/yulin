import {
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertOneOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";

describe("DynamoDB DescribeTableCommand", () => {
  it("describes a table the way it was created", async () => {
    // Given a table created with everything a request can name.
    const simAws = new SimAws();
    const simDynamoDb = simAws
      .account("666666666666")
      .region("eu-west-2")
      .dynamoDb();

    const creation = await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "OrdersTable",
        KeySchema: [
          { AttributeName: "customerId", KeyType: "HASH" },
          { AttributeName: "orderedAt", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "customerId", AttributeType: "S" },
          { AttributeName: "orderedAt", AttributeType: "N" },
        ],
        BillingMode: "PROVISIONED",
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 3 },
        TableClass: "STANDARD_INFREQUENT_ACCESS",
        DeletionProtectionEnabled: true,
      }),
    );

    // When the table is described.
    const description = await simDynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "OrdersTable" }),
    );

    // Then the description is the one creation answered with.
    const table = description.Table;
    assertNonNullable(table);
    assertIdentical(table.TableName, "OrdersTable");
    assertIdentical(
      table.TableArn,
      "arn:aws:dynamodb:eu-west-2:666666666666:table/OrdersTable",
    );
    assertIdentical(table.TableId, creation.TableDescription?.TableId);
    assertIdentical(table.KeySchema?.[1]?.AttributeName, "orderedAt");
    assertIdentical(table.AttributeDefinitions?.[1]?.AttributeType, "N");
    assertIdentical(table.ProvisionedThroughput?.ReadCapacityUnits, 5);
    assertIdentical(
      table.BillingModeSummary?.BillingMode,
      creation.TableDescription?.BillingModeSummary?.BillingMode,
    );
    assertIdentical(
      table.TableClassSummary?.TableClass,
      "STANDARD_INFREQUENT_ACCESS",
    );
    assertTrue(table.DeletionProtectionEnabled);
    assertIdentical(table.ItemCount, 0);
    assertIdentical(table.TableSizeBytes, 0);
    assertIdentical(
      table.CreationDateTime?.getTime(),
      creation.TableDescription?.CreationDateTime?.getTime(),
    );

    await simAws.backgroundTasksComplete();
  });

  it("reports the table becoming active", async () => {
    // Given a table being created.
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

    // When it is described before and after the background work has run.
    const whileCreating = await simDynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "FoobarTable" }),
    );
    await simAws.backgroundTasksComplete();
    const once = await simDynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "FoobarTable" }),
    );

    // Then the status follows the table through creation.
    assertOneOf(whileCreating.Table?.TableStatus, ["CREATING", "ACTIVE"]);
    assertIdentical(once.Table?.TableStatus, "ACTIVE");
  });

  it("takes the table ARN in place of its name", async () => {
    // Given a table with a known ARN.
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

    // When the table is described by its ARN.
    const description = await simDynamoDb.describeTable(
      new DescribeTableCommand({
        TableName: "arn:aws:dynamodb:eu-west-2:666666666666:table/FoobarTable",
      }),
    );

    // Then it is the same table.
    assertIdentical(description.Table?.TableName, "FoobarTable");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a table ARN from another Account", async () => {
    // Given a simulated DynamoDB in one Account.
    const simAws = new SimAws();
    const simDynamoDb = simAws
      .account("666666666666")
      .region("eu-west-2")
      .dynamoDb();

    // When a table in another Account is described by its ARN.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.describeTable(
        new DescribeTableCommand({
          TableName:
            "arn:aws:dynamodb:eu-west-2:111111111111:table/FoobarTable",
        }),
      ),
    );

    // Then it is refused rather than answered with the local table.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "another Account or Region");
  });

  it("refuses an ARN that is not a table ARN", async () => {
    // Given a simulated DynamoDB.
    const simDynamoDb = new SimAws().dynamoDb();

    // When something that is not a table ARN is described.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.describeTable(
        new DescribeTableCommand({
          TableName: "arn:aws:sqs:eu-west-2:111111111111:queue/FoobarQueue",
        }),
      ),
    );

    // Then the ARN is reported as invalid.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "is not a table ARN");
  });

  it("requires a table name", async () => {
    // Given a simulated DynamoDB.
    const simDynamoDb = new SimAws().dynamoDb();

    // When a table is described with no name.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.describeTable(
        new DescribeTableCommand({ TableName: undefined }),
      ),
    );

    // Then the missing name is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A TableName is required");
  });

  it("reports a table that is not there", async () => {
    // Given a simulated DynamoDB with no tables.
    const simDynamoDb = new SimAws().dynamoDb();

    // When a table that does not exist is described.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.describeTable(
        new DescribeTableCommand({ TableName: "NonExistentTable" }),
      ),
    );

    // Then it is reported as not found.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });
});

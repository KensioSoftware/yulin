import {
  CreateTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbResourceInUseException } from "../../error/dynamodb.error.js";

describe("DynamoDB CreateTableCommand", () => {
  it("creates a table and describes it as it was asked for", async () => {
    // Given a simulated DynamoDB in an Account and Region.
    const simAws = new SimAws();
    const simDynamoDb = simAws
      .account("666666666666")
      .region("eu-west-2")
      .dynamoDb();

    // When a table is created on demand.
    const creation = await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FoobarTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    // Then the description carries back what the request named.
    const description = creation.TableDescription;
    assertNonNullable(description);
    assertIdentical(description.TableName, "FoobarTable");
    assertIdentical(description.TableStatus, "CREATING");
    assertIdentical(
      description.TableArn,
      "arn:aws:dynamodb:eu-west-2:666666666666:table/FoobarTable",
    );
    assertNonNullable(description.TableId);

    const keyElement = description.KeySchema?.[0];
    assertNonNullable(keyElement);
    assertIdentical(keyElement.AttributeName, "id");
    assertIdentical(keyElement.KeyType, "HASH");

    const attributeDefinition = description.AttributeDefinitions?.[0];
    assertNonNullable(attributeDefinition);
    assertIdentical(attributeDefinition.AttributeName, "id");
    assertIdentical(attributeDefinition.AttributeType, "S");

    assertFalse(description.DeletionProtectionEnabled);
    assertInstanceOf(description.CreationDateTime, Date);

    await simAws.backgroundTasksComplete();
  });

  it("reports an on-demand table as billed per request with no capacity", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    // When a table is created with PAY_PER_REQUEST billing.
    const creation = await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "OnDemandTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    // Then it reports its billing mode, with the empty throughput real
    // DynamoDB reports for an on-demand table.
    const description = creation.TableDescription;
    assertNonNullable(description);
    assertIdentical(
      description.BillingModeSummary?.BillingMode,
      "PAY_PER_REQUEST",
    );

    const throughput = description.ProvisionedThroughput;
    assertNonNullable(throughput);
    assertIdentical(throughput.ReadCapacityUnits, 0);
    assertIdentical(throughput.WriteCapacityUnits, 0);
    assertIdentical(throughput.NumberOfDecreasesToday, 0);

    await simAws.backgroundTasksComplete();
  });

  it("reports the capacity a provisioned table was created with", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    // When a table is created with provisioned throughput.
    const creation = await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "ProvisionedTable",
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "N" },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 3,
        },
      }),
    );

    // Then the capacity comes back, and the sort key with it.
    const description = creation.TableDescription;
    assertNonNullable(description);

    const throughput = description.ProvisionedThroughput;
    assertNonNullable(throughput);
    assertIdentical(throughput.ReadCapacityUnits, 5);
    assertIdentical(throughput.WriteCapacityUnits, 3);
    assertIdentical(description.KeySchema?.[1]?.KeyType, "RANGE");
    // The request never named a billing mode, so the table does not report one.
    assertUndefined(description.BillingModeSummary);

    await simAws.backgroundTasksComplete();
  });

  it("stores the table class and deletion protection it was given", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    // When a table is created with a class and deletion protection.
    const creation = await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "ArchiveTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "B" }],
        BillingMode: "PAY_PER_REQUEST",
        TableClass: "STANDARD_INFREQUENT_ACCESS",
        DeletionProtectionEnabled: true,
      }),
    );

    // Then both come back on the description.
    const description = creation.TableDescription;
    assertNonNullable(description);
    assertIdentical(
      description.TableClassSummary?.TableClass,
      "STANDARD_INFREQUENT_ACCESS",
    );
    assertTrue(description.DeletionProtectionEnabled);

    await simAws.backgroundTasksComplete();
  });

  it("lists a created table and activates it in the background", async () => {
    // Given a simulated DynamoDB with a table being created.
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

    // When the tables are listed.
    const listing = await simDynamoDb.listTables(new ListTablesCommand());

    // Then the new table is there, and becomes active once creation finishes.
    assertArrayLength(listing.TableNames, 1);
    assertIdentical(listing.TableNames[0], "FoobarTable");

    await simAws.backgroundTasksComplete();

    const description = await simDynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "FoobarTable" }),
    );
    assertIdentical(description.Table?.TableStatus, "ACTIVE");
  });

  it("refuses a table name that is already taken", async () => {
    // Given a simulated DynamoDB with a table already created.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const input = {
      TableName: "FoobarTable",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" as const }],
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" as const },
      ],
      BillingMode: "PAY_PER_REQUEST" as const,
    };
    await simDynamoDb.createTable(new CreateTableCommand(input));

    // When the same name is created again.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.createTable(new CreateTableCommand(input)),
    );

    // Then the name is reported as in use.
    assertInstanceOf(error, SimDynamoDbResourceInUseException);
    assertStringIncludes(error.message, "FoobarTable already exists");

    await simAws.backgroundTasksComplete();
  });

  it("gives one of two tables racing for the same name the name", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const input = {
      TableName: "RacedTable",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" as const }],
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" as const },
      ],
      BillingMode: "PAY_PER_REQUEST" as const,
    };

    // When two creates for the same name are in flight together.
    const creations = await Promise.allSettled([
      simDynamoDb.createTable(new CreateTableCommand(input)),
      simDynamoDb.createTable(new CreateTableCommand(input)),
    ]);

    // Then only one of them created the table.
    assertArrayLength(
      creations.filter((creation) => creation.status === "fulfilled"),
      1,
    );

    await simAws.backgroundTasksComplete();
  });
});

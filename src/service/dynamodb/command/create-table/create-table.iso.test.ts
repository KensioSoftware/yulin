import { describe, it } from "vitest";
import {
  CreateTableCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbResourceInUseException } from "../../error/dynamodb.error.js";

describe("DynamoDB CreateTableCommand", () => {
  it("creates new DynamoDB Table", async () => {
    const simAws = new SimAws();

    const simDynamoDb = simAws.account().dynamoDb();

    const createTableOutput = await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FoobarTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      }),
    );

    assertNonNullable(createTableOutput.TableDescription);
    assertIdentical(
      createTableOutput.TableDescription.TableName,
      "FoobarTable",
    );
    assertIdentical(createTableOutput.TableDescription.TableStatus, "CREATING");

    const listTablesOutput = await simDynamoDb.listTables(
      new ListTablesCommand(),
    );

    assertArrayLength(listTablesOutput.TableNames, 1);
    assertIdentical(listTablesOutput.TableNames[0], "FoobarTable");

    await simAws.backgroundTasksComplete();
  });

  it("throws on undefined Table name", async () => {
    const simAws = new SimAws();

    const simDynamoDb = simAws.region().dynamoDb();

    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.createTable(
        new CreateTableCommand({
          TableName: undefined,
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
    );

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "CreateTableCommand.input.TableName required",
    );
  });

  it("throws on missing key schema", async () => {
    const simAws = new SimAws();

    const simDynamoDb = simAws
      .account("666666666666")
      .region("eu-west-2")
      .dynamoDb();

    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.createTable(
        new CreateTableCommand({ TableName: "FoobarTable" }),
      ),
    );

    assertInstanceOf(error, Error);
    assertStringIncludes(error.message, "Table KeySchema is not defined");
  });

  it("throws on duplicate Table name", async () => {
    const simAws = new SimAws();

    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FoobarTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.createTable(
        new CreateTableCommand({ TableName: "FoobarTable" }),
      ),
    );
    assertInstanceOf(error, SimDynamoDbResourceInUseException);
  });
});

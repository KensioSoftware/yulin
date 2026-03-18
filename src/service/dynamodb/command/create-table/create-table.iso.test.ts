import { describe, it } from "vitest";
import {
  CreateTableCommand,
  ListTablesCommand,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb";
import { SimAwsAccount } from "../../../organizations/sim-aws-account.js";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";

describe("DynamoDB CreateTableCommand", () => {
  it("creates new DynamoDB Table", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    const createTableOutput = await simDynamoDb.createTable(
      new CreateTableCommand({ TableName: "FoobarTable" }),
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

    await simAccount.backgroundTasksComplete();
  });

  it("throws on undefined Table name", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await assertThrowsErrorAsync(async () =>
      simDynamoDb.createTable(new CreateTableCommand({ TableName: undefined })),
    );
  });

  it("throws on duplicate Table name", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({ TableName: "FoobarTable" }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.createTable(
        new CreateTableCommand({ TableName: "FoobarTable" }),
      ),
    );
    assertInstanceOf(error, ResourceInUseException);
    assertIdentical(error.$fault, "client");
  });
});

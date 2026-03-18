import { describe, it } from "vitest";
import { SimAwsAccount } from "../../../organizations/sim-aws-account.js";
import {
  CreateTableCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";

describe("DynamoDB ListTablesCommand", () => {
  it("List all DynamoDB Tables", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await Promise.all([
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableA" })),
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableB" })),
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableC" })),
    ]);

    const listTablesOutput = await simDynamoDb.listTables(
      new ListTablesCommand(),
    );

    assertArrayLength(listTablesOutput.TableNames, 3);

    assertIdentical(listTablesOutput.TableNames[0], "TableA");
    assertIdentical(listTablesOutput.TableNames[1], "TableB");
    assertIdentical(listTablesOutput.TableNames[2], "TableC");

    assertIdentical(listTablesOutput.LastEvaluatedTableName, "TableC");
  });

  it("List DynamoDB Tables with limit", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await Promise.all([
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableA" })),
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableB" })),
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableC" })),
    ]);

    const listTablesOutput = await simDynamoDb.listTables(
      new ListTablesCommand({ Limit: 2 }),
    );

    assertArrayLength(listTablesOutput.TableNames, 2);

    assertIdentical(listTablesOutput.TableNames[0], "TableA");
    assertIdentical(listTablesOutput.TableNames[1], "TableB");

    assertIdentical(listTablesOutput.LastEvaluatedTableName, "TableB");
  });

  it("List DynamoDB Tables with exclusive start and limit", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await Promise.all([
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableA" })),
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableB" })),
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableC" })),
    ]);

    const listTablesOutput = await simDynamoDb.listTables(
      new ListTablesCommand({ ExclusiveStartTableName: "TableB", Limit: 2 }),
    );

    assertArrayLength(listTablesOutput.TableNames, 1);

    assertIdentical(listTablesOutput.TableNames[0], "TableC");
    assertIdentical(listTablesOutput.LastEvaluatedTableName, "TableC");
  });
});

import { describe, it } from "vitest";
import {
  CreateTableCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";

describe("DynamoDB ListTablesCommand", () => {
  it("List all DynamoDB Tables", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    await Promise.all([
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableA",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableB",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableC",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
    ]);

    const listTablesOutput = await simDynamoDatabase.listTables(
      new ListTablesCommand(),
    );

    assertArrayLength(listTablesOutput.TableNames, 3);

    assertIdentical(listTablesOutput.TableNames[0], "TableA");
    assertIdentical(listTablesOutput.TableNames[1], "TableB");
    assertIdentical(listTablesOutput.TableNames[2], "TableC");

    assertIdentical(listTablesOutput.LastEvaluatedTableName, "TableC");
  });

  it("List DynamoDB Tables with limit", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    await Promise.all([
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableA",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableB",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableC",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
    ]);

    const listTablesOutput = await simDynamoDatabase.listTables(
      new ListTablesCommand({ Limit: 2 }),
    );

    assertArrayLength(listTablesOutput.TableNames, 2);

    assertIdentical(listTablesOutput.TableNames[0], "TableA");
    assertIdentical(listTablesOutput.TableNames[1], "TableB");

    assertIdentical(listTablesOutput.LastEvaluatedTableName, "TableB");
  });

  it("List DynamoDB Tables with exclusive start and limit", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    await Promise.all([
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableA",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableB",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableC",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
    ]);

    const listTablesOutput = await simDynamoDatabase.listTables(
      new ListTablesCommand({ ExclusiveStartTableName: "TableB", Limit: 2 }),
    );

    assertArrayLength(listTablesOutput.TableNames, 1);

    assertIdentical(listTablesOutput.TableNames[0], "TableC");
    assertIdentical(listTablesOutput.LastEvaluatedTableName, "TableC");
  });
});

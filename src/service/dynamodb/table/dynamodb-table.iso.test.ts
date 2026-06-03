import { describe, it } from "vitest";
import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { makeSimDynamoDbTableArn, SimDynamoDbTable } from "./dynamodb-table.js";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { BackgroundTasks } from "../../../util/background/background.js";

describe("SimDynamoDbTable", () => {
  it("throws when TableName is undefined", () => {
    const command = new CreateTableCommand({ TableName: undefined });

    assertThrowsError(
      () =>
        new SimDynamoDbTable(
          command,
          makeSimDynamoDbTableArn(),
          new BackgroundTasks(),
        ),
    );
  });

  it("creates table with CREATING status", () => {
    const command = new CreateTableCommand({
      TableName: "test-table",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    });

    const table = new SimDynamoDbTable(
      command,
      makeSimDynamoDbTableArn(),
      new BackgroundTasks(),
    );

    assertIdentical(table.tableName, "test-table");
    assertIdentical(table.status, "CREATING");
    assertInstanceOf(table.creationDateTime, Date);
  });

  it("activates table", async () => {
    const command = new CreateTableCommand({
      TableName: "test-table",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    });

    const table = new SimDynamoDbTable(
      command,
      makeSimDynamoDbTableArn(),
      new BackgroundTasks(),
    );
    assertIdentical(table.status, "CREATING");

    await table.activate();

    assertIdentical(table.status, "ACTIVE");
  });
});

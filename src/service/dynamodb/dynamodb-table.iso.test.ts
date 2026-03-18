import { describe, it } from "vitest";
import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { SimDynamoDbTable } from "./dynamodb-table.js";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";

describe("SimDynamoDbTable", () => {
  it("throws when TableName is undefined", () => {
    const command = new CreateTableCommand({ TableName: undefined });

    assertThrowsError(() => new SimDynamoDbTable(command));
  });

  it("creates table with CREATING status", () => {
    const command = new CreateTableCommand({
      TableName: "test-table",
    });

    const table = new SimDynamoDbTable(command);

    assertIdentical(table.tableName, "test-table");
    assertIdentical(table.status, "CREATING");
    assertInstanceOf(table.creationDateTime, Date);
  });

  it("activates table", async () => {
    const command = new CreateTableCommand({
      TableName: "test-table",
    });

    const table = new SimDynamoDbTable(command);
    assertIdentical(table.status, "CREATING");

    await table.activate();

    assertIdentical(table.status, "ACTIVE");
  });
});

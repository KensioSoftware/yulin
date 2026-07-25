import { describe, it } from "vitest";
import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { SimDynamoDbTable as SimDynamoDatabaseTable } from "./sim-dynamodb-table.js";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";

describe("SimDynamoDbTable", () => {
  it("throws when TableName is undefined", () => {
    const tableCommand = new CreateTableCommand({ TableName: undefined });

    assertThrowsError(() => new SimDynamoDatabaseTable({ tableCommand }));
  });

  it("creates table with CREATING status", () => {
    const tableCommand = new CreateTableCommand({
      TableName: "test-table",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    });

    const table = new SimDynamoDatabaseTable({ tableCommand });

    assertIdentical(table.tableName, "test-table");
    assertIdentical(table.status, "CREATING");
    assertInstanceOf(table.creationDateTime, Date);
  });

  it("activates table", async () => {
    const tableCommand = new CreateTableCommand({
      TableName: "test-table",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    });

    const table = new SimDynamoDatabaseTable({ tableCommand });
    assertIdentical(table.status, "CREATING");

    await table.activate();

    assertIdentical(table.status, "ACTIVE");
  });
});

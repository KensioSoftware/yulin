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
    const createCommand = new CreateTableCommand({ TableName: undefined });

    assertThrowsError(() => new SimDynamoDbTable({ createCommand }));
  });

  it("creates table with CREATING status", () => {
    const createCommand = new CreateTableCommand({
      TableName: "test-table",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    });

    const table = new SimDynamoDbTable({ createCommand });

    assertIdentical(table.tableName, "test-table");
    assertIdentical(table.status, "CREATING");
    assertInstanceOf(table.creationDateTime, Date);
  });

  it("activates table", async () => {
    const createCommand = new CreateTableCommand({
      TableName: "test-table",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    });

    const table = new SimDynamoDbTable({ createCommand });
    assertIdentical(table.status, "CREATING");

    await table.activate();

    assertIdentical(table.status, "ACTIVE");
  });
});

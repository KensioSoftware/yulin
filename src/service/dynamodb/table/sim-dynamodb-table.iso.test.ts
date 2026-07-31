import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertStringLength,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { SimDynamoDbTableName } from "./sim-dynamodb-table-name.js";
import { simDynamoDbTableFactory } from "./sim-dynamodb-table.factory.js";

describe("SimDynamoDbTable", () => {
  it("starts in CREATING status", () => {
    // Given a table built from values a request has been checked against.
    const table = simDynamoDbTableFactory.make({ tableName: "FoobarTable" });

    // Then it is being created, and knows what it was made of.
    assertIdentical(table.tableName, "FoobarTable");
    assertIdentical(table.status, "CREATING");
    assertIdentical(table.keySchema.hashKeyAttributeName, "id");
    assertInstanceOf(table.creationDateTime, Date);
  });

  it("activates", async () => {
    // Given a table being created.
    const table = simDynamoDbTableFactory.make();
    assertIdentical(table.status, "CREATING");

    // When the simulated creation finishes.
    await table.activate();

    // Then the table is active.
    assertIdentical(table.status, "ACTIVE");
  });

  it("describes itself the way DynamoDB reports a table", () => {
    // Given a table in an Account and Region.
    const table = simDynamoDbTableFactory.make({
      tableName: "OrdersTable",
      partitionKeyName: "orderId",
    });

    // When the table is described.
    const description = table.toDescription();

    // Then the description carries what the table was made of.
    assertIdentical(description.TableName, "OrdersTable");
    assertIdentical(
      description.TableArn,
      "arn:aws:dynamodb:eu-west-2:111111111111:table/OrdersTable",
    );
    assertIdentical(description.KeySchema?.[0]?.AttributeName, "orderId");
    assertIdentical(
      description.AttributeDefinitions?.[0]?.AttributeName,
      "orderId",
    );
    assertIdentical(description.ItemCount, 0);
    assertIdentical(description.TableSizeBytes, 0);
    assertFalse(description.DeletionProtectionEnabled);
    assertUndefined(description.TableClassSummary);
  });

  it("gives each table its own identifier", () => {
    // Given two tables.
    const first = simDynamoDbTableFactory.make({ tableName: "FirstTable" });
    const second = simDynamoDbTableFactory.make({ tableName: "SecondTable" });

    // Then each has its own table ID.
    assertFalse(first.tableId === second.tableId);
  });
});

describe("SimDynamoDbTableName", () => {
  it("refuses a name shorter than three characters", () => {
    // When a two character table name is read.
    const error = assertThrowsError(() => SimDynamoDbTableName.of("ab"));

    // Then it is refused the way real DynamoDB refuses it.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "TableName 'ab' is invalid");
  });

  it("allows a name of the greatest length real DynamoDB allows", () => {
    // When a 255 character table name is read.
    const name = SimDynamoDbTableName.of("a".repeat(255));

    // Then it is accepted, and one character longer is not.
    assertStringLength(name.value, 255);
    assertInstanceOf(
      assertThrowsError(() => SimDynamoDbTableName.of("a".repeat(256))),
      SimDynamoDbValidationException,
    );
  });

  it("allows the characters real DynamoDB allows", () => {
    // When a name with each allowed kind of character is read.
    const name = SimDynamoDbTableName.of("Foobar_table-1.v2");

    // Then it is accepted.
    assertIdentical(name.value, "Foobar_table-1.v2");
  });
});

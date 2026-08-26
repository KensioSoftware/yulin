import {
  CreateDatabaseCommand,
  CreatePartitionCommand,
  CreateTableCommand,
  DeleteTableCommand,
  GetDatabaseCommand,
  GetPartitionsCommand,
  GetTableCommand,
  GetTablesCommand,
} from "@aws-sdk/client-glue";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { SimGlueAlreadyExistsException } from "./error/sim-glue.error.js";
import type { SimGlue } from "./sim-glue.js";

/** A catalog holding one mixed case database and one mixed case table. */
function aMixedCaseCatalog(glue: SimGlue): void {
  glue.createDatabase(
    new CreateDatabaseCommand({ DatabaseInput: { Name: "Rainlytics" } }),
  );
  glue.createTable(
    new CreateTableCommand({
      DatabaseName: "Rainlytics",
      TableInput: {
        Name: "Access_Logs",
        PartitionKeys: [{ Name: "day", Type: "string" }],
        StorageDescriptor: { Location: "s3://rainlytics-logs/" },
      },
    }),
  );
}

describe("folding Glue catalog names", () => {
  it("reads a database back under the name it was folded to", () => {
    // Given a database created with a capital letter in its name.
    const glue = new SimAws().glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "Rainlytics" } }),
    );

    // When it is read back by the name it was given.
    const { Database } = glue.getDatabase(
      new GetDatabaseCommand({ Name: "Rainlytics" }),
    );

    // Then it reports the folded name. Real Glue folds a database name to
    // lower case when it stores it, for compatibility with Apache Hive.
    assertIdentical(Database.Name, "rainlytics");
  });

  it("finds a database under either spelling", () => {
    // Given a database created in lower case.
    const glue = new SimAws().glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "rainlytics" } }),
    );

    // When it is read back with a capital letter.
    const { Database } = glue.getDatabase(
      new GetDatabaseCommand({ Name: "RAINLYTICS" }),
    );

    // Then it is found, since there is only one spelling it could be stored
    // under.
    assertIdentical(Database.Name, "rainlytics");
  });

  it("refuses a second database differing only by case", () => {
    // Given a database already created.
    const glue = new SimAws().glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "rainlytics" } }),
    );

    // When one is created whose name differs only by case.
    const error = assertThrowsError(() => {
      glue.createDatabase(
        new CreateDatabaseCommand({ DatabaseInput: { Name: "Rainlytics" } }),
      );
    });

    // Then it is the same database, and creating it again fails.
    assertInstanceOf(error, SimGlueAlreadyExistsException);
  });

  it("folds a table name and the database it names", () => {
    // Given a table created with capitals in both names.
    const glue = new SimAws().glue();

    aMixedCaseCatalog(glue);

    // When it is read back.
    const { Table } = glue.getTable(
      new GetTableCommand({
        DatabaseName: "rainlytics",
        Name: "access_logs",
      }),
    );

    // Then both come back folded. Real Glue says the same thing of
    // TableInput.Name as it does of DatabaseInput.Name.
    assertIdentical(Table.Name, "access_logs");
    assertIdentical(Table.DatabaseName, "rainlytics");
  });

  it("lists and deletes a table under either spelling", () => {
    // Given a mixed case table in a mixed case database.
    const glue = new SimAws().glue();

    aMixedCaseCatalog(glue);

    // When it is listed and then deleted under different spellings.
    const { TableList } = glue.getTables(
      new GetTablesCommand({ DatabaseName: "RAINLYTICS" }),
    );

    glue.deleteTable(
      new DeleteTableCommand({
        DatabaseName: "Rainlytics",
        Name: "ACCESS_LOGS",
      }),
    );

    // Then every command reaches the one table there is.
    assertArrayEquals(
      TableList.map((table) => table.Name),
      ["access_logs"],
    );
    assertArrayLength(glue.tablesInDatabase("rainlytics"), 0);
  });

  it("reaches a partition under either spelling of its table", () => {
    // Given a partition registered against a mixed case table.
    const glue = new SimAws().glue();

    aMixedCaseCatalog(glue);
    glue.createPartition(
      new CreatePartitionCommand({
        DatabaseName: "RAINLYTICS",
        TableName: "Access_Logs",
        PartitionInput: { Values: ["2026-08-26"] },
      }),
    );

    // When the table's partitions are listed under a third spelling.
    const { Partitions } = glue.getPartitions(
      new GetPartitionsCommand({
        DatabaseName: "rainlytics",
        TableName: "ACCESS_LOGS",
      }),
    );

    // Then the partition is there, reported against the folded names.
    assertArrayLength(Partitions, 1);
    assertIdentical(Partitions[0].TableName, "access_logs");
    assertIdentical(Partitions[0].DatabaseName, "rainlytics");
  });

  it("finds a table through the simulator's own accessors", () => {
    // Given a mixed case table.
    const glue = new SimAws().glue();

    aMixedCaseCatalog(glue);

    // When it is looked for without going through a Command.
    const found = glue.findTable("Rainlytics", "Access_Logs");

    // Then the accessors fold too, so a test reading state back is not
    // holding a spelling the catalog never stored.
    assertNonNullable(found);
    assertIdentical(found.name, "access_logs");
    assertNonNullable(glue.findDatabase("RAINLYTICS"));
  });

  it("leaves a column name the case it was given", () => {
    // Given a table whose columns carry capitals.
    const glue = new SimAws().glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "rainlytics" } }),
    );
    glue.createTable(
      new CreateTableCommand({
        DatabaseName: "rainlytics",
        TableInput: {
          Name: "access_logs",
          PartitionKeys: [{ Name: "Day", Type: "string" }],
          StorageDescriptor: { Columns: [{ Name: "Url", Type: "string" }] },
        },
      }),
    );

    // When the table is read back.
    const { Table } = glue.getTable(
      new GetTableCommand({
        DatabaseName: "rainlytics",
        Name: "access_logs",
      }),
    );

    // Then the column names keep their case. Athena folds a column name when
    // it runs a query, and nothing here resolves one by name.
    assertIdentical(Table.PartitionKeys[0]?.Name, "Day");
    assertIdentical(Table.StorageDescriptor?.Columns?.[0]?.Name, "Url");
  });
});

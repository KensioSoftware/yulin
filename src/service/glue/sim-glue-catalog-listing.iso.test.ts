import {
  CreateDatabaseCommand,
  CreateTableCommand,
  DeleteDatabaseCommand,
  DeleteTableCommand,
  GetDatabasesCommand,
  GetTablesCommand,
} from "@aws-sdk/client-glue";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimGlueEntityNotFoundException,
  SimGlueInvalidInputException,
} from "./error/sim-glue.error.js";
import type { SimGlue } from "./sim-glue.js";

function catalogWithTables(glue: SimGlue): void {
  glue.createDatabase(
    new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
  );
  glue.createDatabase(
    new CreateDatabaseCommand({ DatabaseInput: { Name: "app_logs" } }),
  );
  glue.createTable(
    new CreateTableCommand({
      DatabaseName: "site_logs",
      TableInput: { Name: "access_logs" },
    }),
  );
  glue.createTable(
    new CreateTableCommand({
      DatabaseName: "app_logs",
      TableInput: { Name: "access_logs" },
    }),
  );
}

describe("SimGlue listings", () => {
  it("lists databases and tables in creation order", () => {
    // Given two databases, each holding a table of the same name.
    const glue = new SimAws().glue();

    catalogWithTables(glue);

    // When each listing is read.
    const databases = glue.getDatabases(new GetDatabasesCommand({}));
    const tables = glue.getTables(
      new GetTablesCommand({ DatabaseName: "site_logs" }),
    );

    // Then they come back in creation order, and a table name is unique to
    // the database holding it rather than to the catalog.
    assertArrayEquals(
      databases.DatabaseList.map((database) => database.Name),
      ["site_logs", "app_logs"],
    );
    assertArrayEquals(
      tables.TableList.map((table) => table.Name),
      ["access_logs"],
    );
    assertArrayLength(glue.allDatabases(), 2);
    assertArrayLength(glue.tablesInDatabase("app_logs"), 1);
  });

  it("takes a database's tables down with it", () => {
    // Given two databases, each holding a table.
    const glue = new SimAws().glue();

    catalogWithTables(glue);

    // When one database is deleted.
    glue.deleteDatabase(new DeleteDatabaseCommand({ Name: "site_logs" }));

    // Then its table goes with it, and the other database is untouched.
    assertArrayLength(glue.tablesInDatabase("site_logs"), 0);
    assertArrayLength(glue.tablesInDatabase("app_logs"), 1);
  });

  it("refuses deleting a database or table that is not there", () => {
    // Given a catalog holding one database and no tables.
    const glue = new SimAws().glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );

    // When each is deleted by a name nobody created.
    const databaseError = assertThrowsError(() => {
      glue.deleteDatabase(new DeleteDatabaseCommand({ Name: "app_logs" }));
    });
    const tableError = assertThrowsError(() => {
      glue.deleteTable(
        new DeleteTableCommand({
          DatabaseName: "site_logs",
          Name: "access_logs",
        }),
      );
    });

    // Then both are refused the way real Glue refuses them.
    assertInstanceOf(databaseError, SimGlueEntityNotFoundException);
    assertInstanceOf(tableError, SimGlueEntityNotFoundException);
  });

  it("refuses listing tables in a database that is not there", () => {
    // Given a catalog with nothing in it.
    const glue = new SimAws().glue();

    // When a database nobody created is listed.
    const error = assertThrowsError(() => {
      glue.getTables(new GetTablesCommand({ DatabaseName: "site_logs" }));
    });

    // Then it fails rather than answering with an empty list.
    assertInstanceOf(error, SimGlueEntityNotFoundException);
  });
});

describe("SimGlue names and ARNs", () => {
  it("names a database and a table by ARN, as an IAM policy does", () => {
    // Given a table in a database.
    const simAws = new SimAws({ defaultAccountId: "111111111111" });
    const glue = simAws.glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );
    glue.createTable(
      new CreateTableCommand({
        DatabaseName: "site_logs",
        TableInput: {
          Name: "access_logs",
          StorageDescriptor: { Columns: [{ Name: "status", Type: "int" }] },
        },
      }),
    );

    // When each ARN is read.
    const database = glue.findDatabase("site_logs");
    const table = glue.findTable("site_logs", "access_logs");

    // Then a table ARN names the database holding it, which is what a policy
    // scoped to one table has to write.
    assertNonNullable(database);
    assertNonNullable(table);
    assertIdentical(
      database.arn,
      "arn:aws:glue:us-east-1:111111111111:database/site_logs",
    );
    assertIdentical(
      table.arn,
      "arn:aws:glue:us-east-1:111111111111:table/site_logs/access_logs",
    );
    assertIdentical(table.catalogId, "111111111111");
    assertArrayLength(table.columns, 1);
  });

  it("refuses a name longer than real Glue accepts", () => {
    // Given a catalog.
    const glue = new SimAws().glue();

    // When a database is created with a 256 character name.
    const error = assertThrowsError(() => {
      glue.createDatabase(
        new CreateDatabaseCommand({
          DatabaseInput: { Name: "a".repeat(256) },
        }),
      );
    });

    // Then it is refused, as real Glue caps these names at 255.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "255");
  });

  it("refuses a column declared without a name", () => {
    // Given a database to put a table in.
    const glue = new SimAws().glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );

    // When a table declares a partition key and a column with no name. The SDK
    // types the name as optional, so the check belongs here.
    const partitionKeyError = assertThrowsError(() => {
      glue.createTable({
        input: {
          DatabaseName: "site_logs",
          TableInput: { Name: "access_logs", PartitionKeys: [{}] },
        },
      });
    });
    const columnError = assertThrowsError(() => {
      glue.createTable(
        new CreateTableCommand({
          DatabaseName: "site_logs",
          TableInput: {
            Name: "access_logs",
            StorageDescriptor: { Columns: [{ Name: "" }] },
          },
        }),
      );
    });

    // Then both are refused, since a column is identified by its name.
    assertInstanceOf(partitionKeyError, SimGlueInvalidInputException);
    assertStringIncludes(partitionKeyError.message, "PartitionKeys.0.Name");
    assertInstanceOf(columnError, SimGlueInvalidInputException);
    assertStringIncludes(columnError.message, "Columns.0.Name");
  });
});

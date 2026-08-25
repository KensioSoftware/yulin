import {
  CreateDatabaseCommand,
  CreateTableCommand,
  DeleteDatabaseCommand,
  DeleteTableCommand,
  GetDatabasesCommand,
  GetTableCommand,
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

  it("caps a name at 255 UTF-8 bytes rather than 255 characters", () => {
    // Given a catalog.
    const glue = new SimAws().glue();

    // When a database is created at the limit, one byte over it, and once
    // with 128 two-byte characters, which is 256 bytes in 128 characters.
    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "a".repeat(255) } }),
    );

    const tooLong = assertThrowsError(() => {
      glue.createDatabase(
        new CreateDatabaseCommand({
          DatabaseInput: { Name: "a".repeat(256) },
        }),
      );
    });
    const tooManyBytes = assertThrowsError(() => {
      glue.createDatabase(
        new CreateDatabaseCommand({
          DatabaseInput: { Name: "é".repeat(128) },
        }),
      );
    });

    // Then the byte count is what decides it, which is how the Data Catalog
    // states the limit.
    assertInstanceOf(tooLong, SimGlueInvalidInputException);
    assertInstanceOf(tooManyBytes, SimGlueInvalidInputException);
    assertStringIncludes(tooManyBytes.message, "255 UTF-8 bytes");
  });

  it("holds a column name to the same limit", () => {
    // Given a database to put a table in.
    const glue = new SimAws().glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );

    // When a column is declared with a name over the limit.
    const error = assertThrowsError(() => {
      glue.createTable(
        new CreateTableCommand({
          DatabaseName: "site_logs",
          TableInput: {
            Name: "access_logs",
            StorageDescriptor: { Columns: [{ Name: "a".repeat(256) }] },
          },
        }),
      );
    });

    // Then it is refused, since the Data Catalog caps all three the same way.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "Columns.0.Name");
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

describe("SimGlue catalog state", () => {
  it("hands back a table detached from the one it holds", () => {
    // Given a table with parameters and partition keys.
    const glue = new SimAws().glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );
    glue.createTable(
      new CreateTableCommand({
        DatabaseName: "site_logs",
        TableInput: {
          Name: "access_logs",
          PartitionKeys: [{ Name: "year", Type: "string" }],
          StorageDescriptor: { Location: "s3://site-logs/" },
          Parameters: { "projection.enabled": "true" },
        },
      }),
    );

    // When a caller mutates what GetTable answered with.
    const first = glue.getTable(
      new GetTableCommand({ DatabaseName: "site_logs", Name: "access_logs" }),
    );

    (first.Table.Parameters as Record<string, string>)["projection.enabled"] =
      "false";
    (first.Table.StorageDescriptor as { Location?: string }).Location =
      "s3://elsewhere/";

    // Then the catalog is unchanged, since real Glue answers each request with
    // its own object rather than a handle on the stored definition.
    const second = glue.getTable(
      new GetTableCommand({ DatabaseName: "site_logs", Name: "access_logs" }),
    );

    assertIdentical(second.Table.Parameters["projection.enabled"], "true");
    assertIdentical(
      second.Table.StorageDescriptor?.Location,
      "s3://site-logs/",
    );
  });

  it("keeps a table declared with input the caller then reuses", () => {
    // Given a TableInput a caller holds on to, which is the ordinary case when
    // a helper builds one and creates two tables from it.
    const glue = new SimAws().glue();
    const columns = [{ Name: "status", Type: "int" }];
    const parameters: Record<string, string> = { "projection.enabled": "true" };

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );
    glue.createTable(
      new CreateTableCommand({
        DatabaseName: "site_logs",
        TableInput: {
          Name: "access_logs",
          StorageDescriptor: { Columns: columns },
          Parameters: parameters,
        },
      }),
    );

    // When the caller changes that input afterwards.
    columns[0] = { Name: "status", Type: "string" };
    parameters["projection.enabled"] = "false";

    // Then the stored table keeps what it was created with.
    const { Table } = glue.getTable(
      new GetTableCommand({ DatabaseName: "site_logs", Name: "access_logs" }),
    );

    assertIdentical(Table.StorageDescriptor?.Columns?.[0]?.Type, "int");
    assertIdentical(Table.Parameters["projection.enabled"], "true");
  });
});

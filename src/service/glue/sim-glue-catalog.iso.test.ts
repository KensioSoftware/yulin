import {
  CreateDatabaseCommand,
  CreateTableCommand,
  GetDatabaseCommand,
  GetTableCommand,
} from "@aws-sdk/client-glue";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimGlueAlreadyExistsException,
  SimGlueEntityNotFoundException,
  SimGlueInvalidInputException,
} from "./error/sim-glue.error.js";

describe("SimGlue databases", () => {
  it("reads a database back with what it was created with", () => {
    // Given a database created with a description and parameters.
    const glue = new SimAws({ defaultAccountId: "111111111111" }).glue();

    glue.createDatabase(
      new CreateDatabaseCommand({
        DatabaseInput: {
          Name: "site_logs",
          Description: "CloudFront access logs",
          LocationUri: "s3://site-logs/",
          Parameters: { owner: "analytics" },
        },
      }),
    );

    // When it is read back.
    const { Database } = glue.getDatabase(
      new GetDatabaseCommand({ Name: "site_logs" }),
    );

    // Then every field comes back as it went in, under this account's catalog.
    assertIdentical(Database.Name, "site_logs");
    assertIdentical(Database.Description, "CloudFront access logs");
    assertIdentical(Database.LocationUri, "s3://site-logs/");
    assertObjectEquals(Database.Parameters, { owner: "analytics" });
    assertIdentical(Database.CatalogId, "111111111111");
  });

  it("refuses a database name already in use", () => {
    // Given a database that has been created.
    const glue = new SimAws().glue();
    const command = new CreateDatabaseCommand({
      DatabaseInput: { Name: "site_logs" },
    });

    glue.createDatabase(command);

    // When the same one is created again.
    const error = assertThrowsError(() => {
      glue.createDatabase(command);
    });

    // Then it fails, as creation is not idempotent on real Glue.
    assertInstanceOf(error, SimGlueAlreadyExistsException);
  });

  it("refuses reading a database that is not there", () => {
    // Given a catalog with nothing in it.
    const glue = new SimAws().glue();

    // When a database nobody created is read.
    const error = assertThrowsError(() => {
      glue.getDatabase(new GetDatabaseCommand({ Name: "site_logs" }));
    });

    // Then it fails the way real Glue fails it.
    assertInstanceOf(error, SimGlueEntityNotFoundException);
  });

  it("refuses another account's Data Catalog", () => {
    // Given a catalog belonging to one account.
    const glue = new SimAws({ defaultAccountId: "111111111111" }).glue();

    // When a request names another account's catalog.
    const error = assertThrowsError(() => {
      glue.getDatabase(
        new GetDatabaseCommand({
          CatalogId: "222222222222",
          Name: "site_logs",
        }),
      );
    });

    // Then it is refused rather than answered from this one.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "222222222222");
  });
});

describe("SimGlue tables", () => {
  it("keeps partition keys out of the storage descriptor columns", () => {
    // Given a table declaring both data columns and partition keys, which real
    // Glue holds apart.
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
          StorageDescriptor: {
            Columns: [{ Name: "status", Type: "int" }],
            Location: "s3://site-logs/",
          },
        },
      }),
    );

    // When the table is read back.
    const { Table } = glue.getTable(
      new GetTableCommand({
        DatabaseName: "site_logs",
        Name: "access_logs",
      }),
    );

    // Then the two stay apart. A partition key repeated among the columns is
    // how a table ends up with a duplicate Athena then refuses to query.
    assertObjectEquals(Table.PartitionKeys, [{ Name: "year", Type: "string" }]);
    assertObjectEquals(Table.StorageDescriptor?.Columns, [
      { Name: "status", Type: "int" },
    ]);
  });

  it("refuses a table whose database is not there", () => {
    // Given a catalog with no database in it.
    const glue = new SimAws().glue();

    // When a table is created in a database nobody made.
    const error = assertThrowsError(() => {
      glue.createTable(
        new CreateTableCommand({
          DatabaseName: "site_logs",
          TableInput: { Name: "access_logs" },
        }),
      );
    });

    // Then it fails rather than creating the database on the way past.
    assertInstanceOf(error, SimGlueEntityNotFoundException);
  });

  it("refuses reading a table that is not there", () => {
    // Given a database holding no tables.
    const glue = new SimAws().glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );

    // When a table nobody created is read.
    const error = assertThrowsError(() => {
      glue.getTable(
        new GetTableCommand({
          DatabaseName: "site_logs",
          Name: "access_logs",
        }),
      );
    });

    // Then it fails the way real Glue fails it.
    assertInstanceOf(error, SimGlueEntityNotFoundException);
  });

  it("refuses a table with no name", () => {
    // Given a database to put a table in.
    const glue = new SimAws().glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );

    // When a table is created without one. The SDK requires a name in its own
    // types, so this is the request a caller reaching past them would make.
    const error = assertThrowsError(() => {
      glue.createTable({
        input: {
          DatabaseName: "site_logs",
          TableInput: { Parameters: { "projection.enabled": "true" } },
        },
      });
    });

    // Then it is refused, since the name is a table's whole identity.
    assertInstanceOf(error, SimGlueInvalidInputException);
  });
});

import {
  CreatePartitionCommand,
  CreateTableCommand,
  DeleteDatabaseCommand,
  DeletePartitionCommand,
  DeleteTableCommand,
  GetPartitionCommand,
  GetPartitionsCommand,
} from "@aws-sdk/client-glue";
import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertObjectHasProperty,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimGlueAlreadyExistsException,
  SimGlueEntityNotFoundException,
  SimGlueInvalidInputException,
} from "./error/sim-glue.error.js";
import {
  createFixturePartition,
  createFixturePartitionedTable,
  fixtureTableName,
} from "./sim-glue-partitions.fixture.js";

describe("SimGlue partitions", () => {
  it("reads a registered partition back with where its data sits", () => {
    // Given a table partitioned by day, with one day registered.
    const glue = new SimAws({ defaultAccountId: "111111111111" }).glue();
    const table = createFixturePartitionedTable(glue);

    glue.createPartition(
      new CreatePartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionInput: {
          Values: ["2026-08-26"],
          StorageDescriptor: { Location: "s3://rainlytics/day=2026-08-26/" },
          Parameters: { compression: "gzip" },
        },
      }),
    );

    // When that partition is read back by its values.
    const { Partition } = glue.getPartition(
      new GetPartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionValues: ["2026-08-26"],
      }),
    );

    // Then it carries the location and the parameters it was registered with,
    // which is what tells a reader where this day's objects are.
    assertArrayEquals(Partition.Values, ["2026-08-26"]);
    assertIdentical(
      Partition.StorageDescriptor?.Location,
      "s3://rainlytics/day=2026-08-26/",
    );
    assertObjectEquals(Partition.Parameters, { compression: "gzip" });
    assertIdentical(Partition.CatalogId, "111111111111");
    assertIdentical(Partition.DatabaseName, table.databaseName);
    assertIdentical(Partition.TableName, table.tableName);
  });

  it("leaves a field nobody set out of the response", () => {
    // Given a partition registered with nothing but its values.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    glue.createPartition(
      new CreatePartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionInput: { Values: ["2026-08-26"] },
      }),
    );

    // When it is read back.
    const { Partition } = glue.getPartition(
      new GetPartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionValues: ["2026-08-26"],
      }),
    );

    // Then the response carries no key for the storage descriptor at all,
    // which is the shape a real Glue response has.
    assertObjectHasProperty(Partition, "CreationTime");
    assertFalse(Object.hasOwn(Partition, "StorageDescriptor"));
    assertFalse(Object.hasOwn(Partition, "LastAccessTime"));
  });

  it("lists every partition of one table in registration order", () => {
    // Given three days registered against one table.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    for (const day of ["2026-08-24", "2026-08-25", "2026-08-26"]) {
      createFixturePartition(glue, table, [day]);
    }

    // When the table's partitions are listed.
    const { Partitions } = glue.getPartitions(
      new GetPartitionsCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
      }),
    );

    // Then all three come back in the order they were registered.
    assertObjectEquals(
      Partitions.map((partition) => partition.Values),
      [["2026-08-24"], ["2026-08-25"], ["2026-08-26"]],
    );
  });

  it("keeps one table's partitions out of another's", () => {
    // Given two tables, each with a partition of the same values.
    const glue = new SimAws().glue();
    const first = createFixturePartitionedTable(glue);
    const second = createFixturePartitionedTable(glue);

    createFixturePartition(glue, first, ["2026-08-26"]);
    createFixturePartition(glue, second, ["2026-08-26"]);

    // When each table is listed.
    const listed = [first, second].map(
      (table) =>
        glue.getPartitions(
          new GetPartitionsCommand({
            DatabaseName: table.databaseName,
            TableName: table.tableName,
          }),
        ).Partitions,
    );

    // Then each holds its own, since values identify a partition only within
    // the table registering them.
    assertArrayLength(listed[0] ?? [], 1);
    assertArrayLength(listed[1] ?? [], 1);
    assertIdentical(listed[0]?.[0]?.TableName, first.tableName);
    assertIdentical(listed[1]?.[0]?.TableName, second.tableName);
  });

  it("refuses values the table has no keys for, naming both counts", () => {
    // Given a table partitioned by one key.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When a partition is registered with two values.
    const error = assertThrowsError(() => {
      glue.createPartition(
        new CreatePartitionCommand({
          DatabaseName: table.databaseName,
          TableName: table.tableName,
          PartitionInput: { Values: ["2026-08-26", "eu-west-2"] },
        }),
      );
    });

    // Then it is refused, and the message says how many of each there are.
    // Values are positional, so a list of the wrong length lines up with the
    // wrong keys.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "2 values");
    assertStringIncludes(error.message, "1 partition key");
  });

  it("refuses a partition on a table declaring no partition keys", () => {
    // Given a table with no partition keys at all.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, []);

    // When a partition is registered against it.
    const error = assertThrowsError(() => {
      createFixturePartition(glue, table, ["2026-08-26"]);
    });

    // Then it is refused by the same count, since it declares none.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "0 partition keys");
  });

  it("refuses values already registered against the table", () => {
    // Given a day already registered.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    createFixturePartition(glue, table, ["2026-08-26"]);

    // When the same day is registered again.
    const error = assertThrowsError(() => {
      createFixturePartition(glue, table, ["2026-08-26"]);
    });

    // Then it fails, as registering is not idempotent on real Glue.
    assertInstanceOf(error, SimGlueAlreadyExistsException);
  });

  it("refuses reading a partition nothing registered", () => {
    // Given a table with no partitions registered.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    // When a day nobody registered is read.
    const error = assertThrowsError(() => {
      glue.getPartition(
        new GetPartitionCommand({
          DatabaseName: table.databaseName,
          TableName: table.tableName,
          PartitionValues: ["2026-08-26"],
        }),
      );
    });

    // Then it fails the way real Glue fails it.
    assertInstanceOf(error, SimGlueEntityNotFoundException);
  });

  it("refuses a partition command naming a table nobody made", () => {
    // Given a database holding no such table.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    // When a partition is registered against a table that is absent.
    const error = assertThrowsError(() => {
      glue.createPartition(
        new CreatePartitionCommand({
          DatabaseName: table.databaseName,
          TableName: fixtureTableName(),
          PartitionInput: { Values: ["2026-08-26"] },
        }),
      );
    });

    // Then it is refused rather than making the table on the way past.
    assertInstanceOf(error, SimGlueEntityNotFoundException);
  });

  it("refuses a GetPartitions Expression rather than ignoring it", () => {
    // Given a table with two days registered.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    createFixturePartition(glue, table, ["2026-08-25"]);
    createFixturePartition(glue, table, ["2026-08-26"]);

    // When they are listed through a filter.
    const error = assertThrowsError(() => {
      glue.getPartitions(
        new GetPartitionsCommand({
          DatabaseName: table.databaseName,
          TableName: table.tableName,
          Expression: "day = '2026-08-26'",
        }),
      );
    });

    // Then it is refused. An ignored filter would answer with the partition
    // the caller asked to leave out.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "Expression");
  });

  it("removes a partition without touching the rest", () => {
    // Given two days registered.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    createFixturePartition(glue, table, ["2026-08-25"]);
    createFixturePartition(glue, table, ["2026-08-26"]);

    // When one of them is deleted.
    glue.deletePartition(
      new DeletePartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionValues: ["2026-08-25"],
      }),
    );

    // Then the other is still there.
    const { Partitions } = glue.getPartitions(
      new GetPartitionsCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
      }),
    );

    assertObjectEquals(
      Partitions.map((partition) => partition.Values),
      [["2026-08-26"]],
    );
  });

  it("refuses deleting a partition nothing registered", () => {
    // Given a table with no partitions registered.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    // When a day nobody registered is deleted.
    const error = assertThrowsError(() => {
      glue.deletePartition(
        new DeletePartitionCommand({
          DatabaseName: table.databaseName,
          TableName: table.tableName,
          PartitionValues: ["2026-08-26"],
        }),
      );
    });

    // Then it fails rather than reporting a deletion that never happened.
    assertInstanceOf(error, SimGlueEntityNotFoundException);
  });

  it("takes a table's partitions with the table", () => {
    // Given a table holding one partition.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    createFixturePartition(glue, table, ["2026-08-26"]);

    // When the table is deleted and a table of the same name is created
    // again.
    glue.deleteTable(
      new DeleteTableCommand({
        DatabaseName: table.databaseName,
        Name: table.tableName,
      }),
    );
    glue.createTable(
      new CreateTableCommand({
        DatabaseName: table.databaseName,
        TableInput: {
          Name: table.tableName,
          PartitionKeys: [{ Name: "day", Type: "string" }],
        },
      }),
    );

    // Then the partition is gone, rather than reappearing under the new
    // table.
    assertUndefined(
      glue.findPartition(table.databaseName, table.tableName, ["2026-08-26"]),
    );
    assertArrayLength(
      glue.partitionsInTable(table.databaseName, table.tableName),
      0,
    );
  });

  it("takes a database's partitions with the database", () => {
    // Given a database whose table holds a partition.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    createFixturePartition(glue, table, ["2026-08-26"]);

    // When the database is deleted.
    glue.deleteDatabase(
      new DeleteDatabaseCommand({ Name: table.databaseName }),
    );

    // Then the partitions go with the tables that went with it.
    assertArrayLength(
      glue.partitionsInTable(table.databaseName, table.tableName),
      0,
    );
  });
});

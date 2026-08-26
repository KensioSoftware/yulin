import {
  CreatePartitionCommand,
  DeletePartitionCommand,
  GetPartitionCommand,
} from "@aws-sdk/client-glue";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simGluePartitionBatchErrors } from "./command/partition/sim-glue-partition-batch.js";
import { SimGlueInvalidInputException } from "./error/sim-glue.error.js";
import {
  createFixturePartition,
  createFixturePartitionedTable,
} from "./sim-glue-partitions.fixture.js";

describe("SimGlue partition registration", () => {
  it("reads back the access and analysis times a partition was given", () => {
    // Given a partition registered with both timestamps a crawler sets.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);
    const lastAccess = new Date("2026-08-26T09:00:00.000Z");
    const lastAnalyzed = new Date("2026-08-26T10:30:00.000Z");

    glue.createPartition(
      new CreatePartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionInput: {
          Values: ["2026-08-26"],
          LastAccessTime: lastAccess,
          LastAnalyzedTime: lastAnalyzed,
        },
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

    // Then both come back as they went in, and the parameters default to none
    // rather than to nothing at all.
    assertIdentical(
      Partition.LastAccessTime?.toISOString(),
      lastAccess.toISOString(),
    );
    assertIdentical(
      Partition.LastAnalyzedTime?.toISOString(),
      lastAnalyzed.toISOString(),
    );
    assertObjectEquals(Partition.Parameters, {});
  });

  it("tells a partition of two values apart from one holding a separator", () => {
    // Given a table partitioned by two keys, with a partition whose first
    // value carries the character a joined key would separate on.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["region", "day"]);

    createFixturePartition(glue, table, ["eu-west-2/2026-08-26", "morning"]);

    // When a partition is registered whose values join to the same string.
    createFixturePartition(glue, table, ["eu-west-2", "2026-08-26/morning"]);

    // Then both are held, rather than the second colliding with the first.
    assertArrayLength(
      glue.partitionsInTable(table.databaseName, table.tableName),
      2,
    );
  });

  it("refuses a CreatePartition carrying no partition input", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    // When a partition is registered with no input at all.
    const error = assertThrowsError(() => {
      glue.createPartition(
        new CreatePartitionCommand({
          DatabaseName: table.databaseName,
          TableName: table.tableName,
          PartitionInput: undefined,
        }),
      );
    });

    // Then it is refused for the values it never gave.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "PartitionInput.Values is required");
  });

  it("refuses a DeletePartition naming no values", () => {
    // Given a table with one day registered.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    createFixturePartition(glue, table, ["2026-08-26"]);

    // When a delete names no values.
    const error = assertThrowsError(() => {
      glue.deletePartition(
        new DeletePartitionCommand({
          DatabaseName: table.databaseName,
          TableName: table.tableName,
          PartitionValues: undefined,
        }),
      );
    });

    // Then it is refused, and the day is still there.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertArrayLength(
      glue.partitionsInTable(table.databaseName, table.tableName),
      1,
    );
  });

  it("registers a partition through the catalog writer", () => {
    // Given a table, and the writer CloudFormation would deploy through.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);
    const writer = glue.catalogWriter();

    // When a partition is written and then removed through it.
    writer.createPartition(
      table.databaseName,
      table.tableName,
      ["2026-08-26"],
      {
        storageDescriptor: { Location: "s3://site-logs/day=2026-08-26/" },
      },
    );

    const registered = glue.findPartition(table.databaseName, table.tableName, [
      "2026-08-26",
    ]);

    writer.deletePartition(table.databaseName, table.tableName, ["2026-08-26"]);

    // Then it was held without an SDK Command, and removing it took it away.
    assertIdentical(
      registered?.storageDescriptor?.Location,
      "s3://site-logs/day=2026-08-26/",
    );
    assertUndefined(
      glue.findPartition(table.databaseName, table.tableName, ["2026-08-26"]),
    );
  });

  it("refuses a catalog writer partition whose table is absent", () => {
    // Given a database holding no table of that name.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    // When a partition is written against a table nobody made.
    const error = assertThrowsError(() => {
      glue
        .catalogWriter()
        .createPartition(table.databaseName, "error_logs", ["2026-08-26"]);
    });

    // Then the deploy fails rather than holding a partition under no table.
    assertStringIncludes(error.message, "error_logs");
  });

  it("lets a fault in the simulation out of a batch", () => {
    // Given a batch entry whose handling fails for a reason no caller asked
    // for.
    const fault = new TypeError("the simulation is broken");

    // When the batch runs.
    const error = assertThrowsError(() => {
      simGluePartitionBatchErrors(
        "PartitionInputList",
        [{ Values: ["2026-08-26"] }],
        () => {
          throw fault;
        },
      );
    });

    // Then it comes out rather than being reported as a refused entry, which
    // would read as though the caller had asked for something invalid.
    assertIdentical(error, fault);
  });
});

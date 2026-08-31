import {
  BatchCreatePartitionCommand,
  BatchDeletePartitionCommand,
  GetPartitionsCommand,
} from "@aws-sdk/client-glue";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { SimGlueInvalidInputException } from "./error/sim-glue.error.js";
import {
  createFixturePartition,
  createFixturePartitionedTable,
} from "./sim-glue-partitions.fixture.js";

describe("SimGlue partition batches", () => {
  it("registers a batch of partitions in one request", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    // When three days are registered at once.
    const { Errors } = glue.batchCreatePartition(
      new BatchCreatePartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionInputList: [
          { Values: ["2026-08-24"] },
          { Values: ["2026-08-25"] },
          { Values: ["2026-08-26"] },
        ],
      }),
    );

    // Then all three are there and nothing is reported.
    assertArrayEmpty(Errors);
    assertArrayLength(
      glue.partitionsInTable(table.databaseName, table.tableName),
      3,
    );
  });

  it("reports the entries it could not make and keeps the rest", () => {
    // Given a day already registered.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    createFixturePartition(glue, table, ["2026-08-25"]);

    // When a batch repeats that day alongside a new one.
    const { Errors } = glue.batchCreatePartition(
      new BatchCreatePartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionInputList: [
          { Values: ["2026-08-25"] },
          { Values: ["2026-08-26"] },
        ],
      }),
    );

    // Then the repeat is reported and the new day is registered, rather than
    // the whole batch failing on the one entry.
    assertArrayLength(Errors, 1);
    assertArrayEquals(Errors[0].PartitionValues, ["2026-08-25"]);
    assertIdentical(Errors[0].ErrorDetail.ErrorCode, "AlreadyExistsException");
    assertArrayLength(
      glue.partitionsInTable(table.databaseName, table.tableName),
      2,
    );
  });

  it("reports a batch entry whose values the table has no keys for", () => {
    // Given a table partitioned by one key.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When a batch carries an entry of two values.
    const { Errors } = glue.batchCreatePartition(
      new BatchCreatePartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionInputList: [
          { Values: ["2026-08-26", "eu-west-2"] },
          { Values: ["2026-08-25"] },
        ],
      }),
    );

    // Then that entry is reported the way a single request would have refused
    // it, and the other is registered.
    assertArrayLength(Errors, 1);
    assertIdentical(Errors[0].ErrorDetail.ErrorCode, "InvalidInputException");
    assertStringIncludes(Errors[0].ErrorDetail.ErrorMessage, "2 values");
    assertArrayLength(
      glue.partitionsInTable(table.databaseName, table.tableName),
      1,
    );
  });

  it("removes a batch of partitions in one request", () => {
    // Given three days registered.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    for (const day of ["2026-08-24", "2026-08-25", "2026-08-26"]) {
      createFixturePartition(glue, table, [day]);
    }

    // When two of them are deleted at once.
    const { Errors } = glue.batchDeletePartition(
      new BatchDeletePartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionsToDelete: [
          { Values: ["2026-08-24"] },
          { Values: ["2026-08-25"] },
        ],
      }),
    );

    // Then only the third is left.
    assertArrayEmpty(Errors);

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

  it("reports the entries a batch delete could not find", () => {
    // Given one day registered.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    createFixturePartition(glue, table, ["2026-08-26"]);

    // When a batch deletes it alongside a day nobody registered.
    const { Errors } = glue.batchDeletePartition(
      new BatchDeletePartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionsToDelete: [
          { Values: ["2026-08-25"] },
          { Values: ["2026-08-26"] },
        ],
      }),
    );

    // Then the absent one is reported and the registered one is gone.
    assertArrayLength(Errors, 1);
    assertArrayEquals(Errors[0].PartitionValues, ["2026-08-25"]);
    assertIdentical(Errors[0].ErrorDetail.ErrorCode, "EntityNotFoundException");
    assertArrayEmpty(
      glue.partitionsInTable(table.databaseName, table.tableName),
    );
  });

  it("answers an empty batch with nothing to report", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    // When a batch carries an empty list, which is within the bounds real
    // Glue states for it.
    const { Errors } = glue.batchCreatePartition(
      new BatchCreatePartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionInputList: [],
      }),
    );

    // Then there is nothing to report and nothing was registered.
    assertArrayEmpty(Errors);
    assertArrayEmpty(
      glue.partitionsInTable(table.databaseName, table.tableName),
    );
  });

  it("refuses a batch leaving its list out altogether", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    // When a batch names no list at all.
    const error = assertThrowsError(() => {
      glue.batchDeletePartition(
        new BatchDeletePartitionCommand({
          DatabaseName: table.databaseName,
          TableName: table.tableName,
          PartitionsToDelete: undefined,
        }),
      );
    });

    // Then it is refused. The list is a required request member on real Glue,
    // and an absent one is a malformed request rather than an empty batch.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "PartitionsToDelete is required");
  });

  it("reports a batch entry naming no values at all", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue);

    // When a batch carries an entry with nothing in it.
    const { Errors } = glue.batchCreatePartition(
      new BatchCreatePartitionCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        PartitionInputList: [{}],
      }),
    );

    // Then it is reported with the values it never gave, which is an empty
    // list rather than an absent one.
    assertArrayLength(Errors, 1);
    assertArrayEmpty(Errors[0].PartitionValues);
    assertIdentical(Errors[0].ErrorDetail.ErrorCode, "InvalidInputException");
  });
});

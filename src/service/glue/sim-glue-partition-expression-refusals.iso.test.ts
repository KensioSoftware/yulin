import { GetPartitionsCommand } from "@aws-sdk/client-glue";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { SimGlueInvalidInputException } from "./error/sim-glue.error.js";
import {
  createFixturePartition,
  createFixturePartitionedTable,
  createFixtureTypedTable,
  type FixturePartitionedTable,
} from "./sim-glue-partitions.fixture.js";
import type { SimGlue } from "./sim-glue.js";

/** List a table's partitions through an expression. */
function listWith(
  glue: SimGlue,
  table: FixturePartitionedTable,
  Expression: string,
): readonly (readonly string[])[] {
  return glue
    .getPartitions(
      new GetPartitionsCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        Expression,
      }),
    )
    .Partitions.map((partition) => partition.Values);
}

/** The error one expression is refused with. */
function refusalFor(
  glue: SimGlue,
  table: FixturePartitionedTable,
  expression: string,
): Error {
  return assertThrowsError(() => {
    listWith(glue, table, expression);
  });
}

describe("SimGlue partition expression types", () => {
  it("compares a key declared as a number numerically", () => {
    // Given a table partitioned by an int, holding a value either side of the
    // point where text and number orders disagree.
    const glue = new SimAws().glue();
    const table = createFixtureTypedTable(glue, [
      { Name: "hour", Type: "int" },
    ]);

    createFixturePartition(glue, table, ["9"]);
    createFixturePartition(glue, table, ["10"]);

    // When the larger of the two is asked for.
    const listed = listWith(glue, table, "hour > 9");

    // Then 10 comes back. Compared as text it would sort below 9 and this
    // would answer with nothing.
    assertArrayEquals(listed.flat(), ["10"]);
  });

  it("compares a key declared as a string as text", () => {
    // Given a table partitioned by a string holding the same two values.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["hour"]);

    createFixturePartition(glue, table, ["9"]);
    createFixturePartition(glue, table, ["10"]);

    // When the same comparison is made.
    const listed = listWith(glue, table, "hour > '9'");

    // Then nothing comes back, since '10' sorts below '9' as text.
    assertArrayEquals(listed.flat(), []);
  });

  it("reads a decimal type carrying its parameters as a number", () => {
    // Given a table partitioned by a decimal declared the way real Glue
    // writes one.
    const glue = new SimAws().glue();
    const table = createFixtureTypedTable(glue, [
      { Name: "amount", Type: "decimal(10,2)" },
    ]);

    createFixturePartition(glue, table, ["9.50"]);
    createFixturePartition(glue, table, ["10.25"]);

    // When a numeric comparison is made.
    const listed = listWith(glue, table, "amount > 9.5");

    // Then the parameters are read past and the values compare as numbers.
    assertArrayEquals(listed.flat(), ["10.25"]);
  });

  it("refuses a value of the wrong type for a numeric key", () => {
    // Given a table partitioned by an int.
    const glue = new SimAws().glue();
    const table = createFixtureTypedTable(glue, [
      { Name: "hour", Type: "int" },
    ]);

    // When it is compared against something that is not a number.
    const error = refusalFor(glue, table, "hour = 'noon'");

    // Then it is refused rather than answering with nothing, which would read
    // as a table that happens to hold no such partition.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "hour is declared as a number");
  });
});

describe("SimGlue partition expression refusals", () => {
  it("refuses a column the table does not partition by, naming it", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When an expression names a column that is not a partition key.
    const error = refusalFor(glue, table, "status = '404'");

    // Then it is refused, naming the column and the keys there are.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "status is not a partition key");
    assertStringIncludes(error.message, "day");
  });

  it("refuses an expression that does not parse, saying where it stopped", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When an expression is missing the value its comparison needs.
    const error = refusalFor(glue, table, "day =");

    // Then it is refused, and the message says where reading stopped.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "at the end of the expression");
  });

  it("refuses an unclosed bracket at the position it was reached", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When a bracket is opened and never closed.
    const error = refusalFor(glue, table, "(day = '2026-08-26'");

    // Then it is refused for the bracket it wanted.
    assertStringIncludes(error.message, "')' was expected");
  });

  it("refuses an expression carrying more after it is complete", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When two terms sit together with nothing joining them.
    const error = refusalFor(glue, table, "day = '1' day = '2'");

    // Then it is refused, at the token that carried on.
    assertStringIncludes(error.message, "and then carried on");
    assertStringIncludes(error.message, "at position 10");
  });

  it("refuses a string literal that is never closed", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When a quote is opened and never closed.
    const error = refusalFor(glue, table, "day = '2026-08-26");

    // Then it is refused at the quote that opened it.
    assertStringIncludes(error.message, "opened and never closed");
    assertStringIncludes(error.message, "at position 6");
  });

  it("refuses a character the grammar has no meaning for", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When an expression carries one.
    const error = refusalFor(glue, table, "day + '1'");

    // Then it is refused, naming the character and where it sits.
    assertStringIncludes(error.message, "'+' is not something");
    assertStringIncludes(error.message, "at position 4");
  });

  it("refuses an expression with nothing in it", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When the expression is blank.
    const error = refusalFor(glue, table, " ".repeat(3));

    // Then it is refused rather than read as no filter at all, which is what
    // leaving the parameter out means.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "filters nothing");
  });

  it("refuses an operator this grammar does not have", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When a term uses something that is not a comparison.
    const error = refusalFor(glue, table, "day ('1')");

    // Then it is refused, naming what was written.
    assertStringIncludes(error.message, "is not a comparison operator");
  });

  it("refuses NOT in front of a plain comparison", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When NOT sits between a key and a comparison, where SQL has no meaning
    // for it.
    const error = refusalFor(glue, table, "day NOT = '1'");

    // Then it is refused, naming what may follow NOT there.
    assertStringIncludes(error.message, "LIKE, IN or BETWEEN was expected");
  });
});

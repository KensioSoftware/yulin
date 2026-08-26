import { GetPartitionsCommand } from "@aws-sdk/client-glue";
import {
  assertArrayEquals,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  createFixturePartition,
  createFixturePartitionedTable,
  createFixtureTypedTable,
  type FixturePartitionedTable,
} from "./sim-glue-partitions.fixture.js";
import type { SimGlue } from "./sim-glue.js";

/** The values a filter answers with, flattened for a one-key table. */
function matching(
  glue: SimGlue,
  table: FixturePartitionedTable,
  Expression: string,
): readonly string[] {
  return glue
    .getPartitions(
      new GetPartitionsCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
        Expression,
      }),
    )
    .Partitions.flatMap((partition) => partition.Values);
}

describe("SimGlue partition expression literals", () => {
  it("reads a quote doubled inside a string literal", () => {
    // Given a partition whose value carries a quote.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["owner"]);

    createFixturePartition(glue, table, ["it's"]);
    createFixturePartition(glue, table, ["theirs"]);

    // When it is asked for with the quote doubled, as SQL writes one.
    const listed = matching(glue, table, "owner = 'it''s'");

    // Then the doubled quote reads as one character in the value.
    assertArrayEquals(listed, ["it's"]);
  });

  it("reads a negative number and a fraction", () => {
    // Given a table partitioned by a number, holding values either side of
    // zero.
    const glue = new SimAws().glue();
    const table = createFixtureTypedTable(glue, [
      { Name: "offset", Type: "double" },
    ]);

    for (const value of ["-3.5", "-1", "2.25"]) {
      createFixturePartition(glue, table, [value]);
    }

    // When each kind of number literal is compared against.
    const above = matching(glue, table, "offset > -2");
    const below = matching(glue, table, "offset <= -3.5");

    // Then both read as the numbers they are written as.
    assertArrayEquals(above, ["-1", "2.25"]);
    assertArrayEquals(below, ["-3.5"]);
  });

  it("refuses a dot that no digit follows", () => {
    // Given a table partitioned by a number.
    const glue = new SimAws().glue();
    const table = createFixtureTypedTable(glue, [
      { Name: "offset", Type: "int" },
    ]);

    // When a literal ends at the dot.
    const error = assertThrowsError(() => {
      matching(glue, table, "offset = 1.");
    });

    // Then the number ends before it and the dot is refused on its own.
    assertStringIncludes(error.message, "'.' is not something");
  });

  it("matches a pattern character that a regular expression would read", () => {
    // Given two partitions differing only where a dot sits.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["host"]);

    createFixturePartition(glue, table, ["a.example"]);
    createFixturePartition(glue, table, ["axexample"]);

    // When a LIKE pattern carries a literal dot.
    const listed = matching(glue, table, "host LIKE 'a.exa%'");

    // Then the dot matches itself rather than any character.
    assertArrayEquals(listed, ["a.example"]);
  });

  it("collapses a run of LIKE wildcards", () => {
    // Given one partition.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["host"]);

    createFixturePartition(glue, table, ["shop.example.com"]);

    // When a pattern repeats the wildcard.
    const listed = matching(glue, table, "host LIKE '%%%example%%%'");

    // Then it asks the same thing one wildcard would.
    assertArrayEquals(listed, ["shop.example.com"]);
  });

  it("treats a key with no declared type as text", () => {
    // Given a table whose partition key declares no type at all.
    const glue = new SimAws().glue();
    const table = createFixtureTypedTable(glue, [{ Name: "day" }]);

    createFixturePartition(glue, table, ["9"]);
    createFixturePartition(glue, table, ["10"]);

    // When the two are compared.
    const listed = matching(glue, table, "day > '9'");

    // Then they compare as text, which is what an unknown type falls back to.
    assertArrayEquals(listed, []);
  });

  it("treats an empty stored value as no number at all", () => {
    // Given a table partitioned by an int, holding a partition registered
    // with an empty value.
    const glue = new SimAws().glue();
    const table = createFixtureTypedTable(glue, [
      { Name: "hour", Type: "int" },
    ]);

    createFixturePartition(glue, table, [""]);
    createFixturePartition(glue, table, ["0"]);

    // When a comparison that zero would satisfy is made.
    const listed = matching(glue, table, "hour >= 0");

    // Then the empty value is left out. Read as a number it would be zero,
    // which is a value nobody registered.
    assertArrayEquals(listed, ["0"]);
  });

  it("reads a missing value as empty where a partition is short", () => {
    // Given a table partitioned by two keys, and a partition the catalog
    // writer registered with one value. That path takes the values it is
    // given rather than holding them to the table.
    const glue = new SimAws().glue();
    const table = createFixtureTypedTable(glue, [
      { Name: "day", Type: "string" },
      { Name: "region", Type: "string" },
    ]);

    glue
      .catalogWriter()
      .createPartition(table.databaseName, table.tableName, ["2026-08-26"]);

    // When the key it has no value for is filtered on.
    const listed = matching(glue, table, "region = ''");

    // Then the value it never got reads as empty.
    assertArrayEquals(listed, ["2026-08-26"]);
  });

  it("leaves out a numeric key whose stored value is not a number", () => {
    // Given a table partitioned by an int, holding a value that is not one.
    // Registration takes the values it is given, so this is reachable.
    const glue = new SimAws().glue();
    const table = createFixtureTypedTable(glue, [
      { Name: "hour", Type: "int" },
    ]);

    createFixturePartition(glue, table, ["noon"]);
    createFixturePartition(glue, table, ["11"]);

    // When a numeric comparison is made.
    const listed = matching(glue, table, "hour >= 0");

    // Then the value with no place in a numeric order matches nothing, and
    // the request still answers.
    assertArrayEquals(listed, ["11"]);
  });
});

describe("SimGlue partition expression grammar refusals", () => {
  it("refuses a BETWEEN missing its AND", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When a range is written without the AND joining its ends.
    const error = assertThrowsError(() => {
      matching(glue, table, "day BETWEEN '1' '2'");
    });

    // Then it is refused for the keyword it wanted.
    assertStringIncludes(error.message, "AND was expected");
  });

  it("refuses an IN list missing its closing bracket", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When the list is opened and never closed.
    const error = assertThrowsError(() => {
      matching(glue, table, "day IN ('1', '2'");
    });

    // Then it is refused for the bracket it wanted.
    assertStringIncludes(error.message, "')' was expected");
  });

  it("refuses a term starting with something that is not a key", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When a term starts with a literal.
    const error = assertThrowsError(() => {
      matching(glue, table, "'2026-08-26' = day");
    });

    // Then it is refused, naming what was written where a key belongs.
    assertStringIncludes(error.message, "is not a name");
  });

  it("refuses a key compared against another key", () => {
    // Given a table partitioned by two keys.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day", "region"]);

    // When one is compared against the other.
    const error = assertThrowsError(() => {
      matching(glue, table, "day = region");
    });

    // Then it is refused. A term compares a key against a value, and real
    // Glue has no column-to-column comparison here either.
    assertStringIncludes(error.message, "is not one");
  });

  it("refuses a value where a comparison operator belongs", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When a key is followed straight by a value.
    const error = assertThrowsError(() => {
      matching(glue, table, "day '2026-08-26'");
    });

    // Then it is refused, naming what was written where the operator belongs.
    assertStringIncludes(error.message, "is not a comparison operator");
  });

  it("refuses an IN list that opens with no bracket", () => {
    // Given a table partitioned by day.
    const glue = new SimAws().glue();
    const table = createFixturePartitionedTable(glue, ["day"]);

    // When the values follow IN with no bracket around them.
    const error = assertThrowsError(() => {
      matching(glue, table, "day IN '1', '2'");
    });

    // Then it is refused for the bracket it wanted.
    assertStringIncludes(error.message, "'(' was expected");
  });
});

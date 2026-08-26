import { GetPartitionsCommand } from "@aws-sdk/client-glue";
import { assertArrayEquals, assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  createFixturePartition,
  createFixturePartitionedTable,
  type FixturePartitionedTable,
} from "./sim-glue-partitions.fixture.js";
import type { SimGlue } from "./sim-glue.js";

/** A table partitioned by day and region, holding four partitions. */
function catalogWithDays(glue: SimGlue): FixturePartitionedTable {
  const table = createFixturePartitionedTable(glue, ["day", "region"]);

  for (const values of [
    ["2026-08-24", "eu-west-2"],
    ["2026-08-25", "eu-west-2"],
    ["2026-08-26", "us-east-1"],
    ["2026-08-27", "ap-south-1"],
  ]) {
    createFixturePartition(glue, table, values);
  }

  return table;
}

/** The days a filter answers with, in registration order. */
function daysMatching(
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
    .Partitions.map((partition) => partition.Values[0] ?? "");
}

describe("SimGlue partition expressions", () => {
  it("filters on an equality", () => {
    // Given a table holding four days.
    const glue = new SimAws().glue();
    const table = catalogWithDays(glue);

    // When one day is asked for.
    const days = daysMatching(glue, table, "day = '2026-08-25'");

    // Then only that day comes back.
    assertArrayEquals(days, ["2026-08-25"]);
  });

  it("filters on each ordering operator", () => {
    // Given a table holding four days.
    const glue = new SimAws().glue();
    const table = catalogWithDays(glue);

    // When each ordering operator is used against the same day.
    const results = [">", ">=", "<", "<=", "<>", "!="].map((operator) =>
      daysMatching(glue, table, `day ${operator} '2026-08-25'`),
    );

    // Then each answers with the run of days it asks for.
    assertArrayEquals(results[0] ?? [], ["2026-08-26", "2026-08-27"]);
    assertArrayEquals(results[1] ?? [], [
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
    ]);
    assertArrayEquals(results[2] ?? [], ["2026-08-24"]);
    assertArrayEquals(results[3] ?? [], ["2026-08-24", "2026-08-25"]);
    assertArrayEquals(results[4] ?? [], [
      "2026-08-24",
      "2026-08-26",
      "2026-08-27",
    ]);
    assertArrayEquals(results[5] ?? [], [
      "2026-08-24",
      "2026-08-26",
      "2026-08-27",
    ]);
  });

  it("filters on LIKE, IN and BETWEEN", () => {
    // Given a table holding four days across three regions.
    const glue = new SimAws().glue();
    const table = catalogWithDays(glue);

    // When each of the three is used.
    const like = daysMatching(glue, table, "region LIKE 'eu-%'");
    const inList = daysMatching(
      glue,
      table,
      "region IN ('us-east-1', 'ap-south-1')",
    );
    const between = daysMatching(
      glue,
      table,
      "day BETWEEN '2026-08-25' AND '2026-08-26'",
    );

    // Then each answers with what it asks for, and BETWEEN takes both ends.
    assertArrayEquals(like, ["2026-08-24", "2026-08-25"]);
    assertArrayEquals(inList, ["2026-08-26", "2026-08-27"]);
    assertArrayEquals(between, ["2026-08-25", "2026-08-26"]);
  });

  it("matches a single character with a LIKE underscore", () => {
    // Given a table holding four regions.
    const glue = new SimAws().glue();
    const table = catalogWithDays(glue);

    // When a pattern of one wildcard character is used.
    const days = daysMatching(glue, table, "region LIKE 'us-east-_'");

    // Then it matches one character rather than any run of them.
    assertArrayEquals(days, ["2026-08-26"]);
  });

  it("combines terms with AND, OR and brackets", () => {
    // Given a table holding four days.
    const glue = new SimAws().glue();
    const table = catalogWithDays(glue);

    // When terms are combined each way.
    const both = daysMatching(
      glue,
      table,
      "day >= '2026-08-25' AND region = 'eu-west-2'",
    );
    const either = daysMatching(
      glue,
      table,
      "day = '2026-08-24' OR day = '2026-08-27'",
    );
    const grouped = daysMatching(
      glue,
      table,
      "(day = '2026-08-24' OR day = '2026-08-26') AND region = 'us-east-1'",
    );

    // Then each combination holds only where it should.
    assertArrayEquals(both, ["2026-08-25"]);
    assertArrayEquals(either, ["2026-08-24", "2026-08-27"]);
    assertArrayEquals(grouped, ["2026-08-26"]);
  });

  it("binds AND tighter than OR", () => {
    // Given a table holding four days.
    const glue = new SimAws().glue();
    const table = catalogWithDays(glue);

    // When an unbracketed OR and AND are mixed.
    const days = daysMatching(
      glue,
      table,
      "day = '2026-08-24' OR day = '2026-08-26' AND region = 'nowhere'",
    );

    // Then the AND binds first, so the second half holds for nothing and the
    // first day is the whole answer. Bracketing the OR would give two.
    assertArrayEquals(days, ["2026-08-24"]);
  });

  it("reverses a term with NOT", () => {
    // Given a table holding four days.
    const glue = new SimAws().glue();
    const table = catalogWithDays(glue);

    // When NOT is put in front of a term, and inside one.
    const prefix = daysMatching(glue, table, "NOT day = '2026-08-24'");
    const grouped = daysMatching(
      glue,
      table,
      "NOT (region = 'eu-west-2' OR region = 'us-east-1')",
    );
    const notIn = daysMatching(
      glue,
      table,
      "region NOT IN ('eu-west-2', 'us-east-1')",
    );
    const notLike = daysMatching(glue, table, "region NOT LIKE 'eu-%'");

    // Then each answers with everything the term leaves out.
    assertArrayLength(prefix, 3);
    assertArrayEquals(grouped, ["2026-08-27"]);
    assertArrayEquals(notIn, ["2026-08-27"]);
    assertArrayEquals(notLike, ["2026-08-26", "2026-08-27"]);
  });

  it("answers with every partition when there is no Expression", () => {
    // Given a table holding four days.
    const glue = new SimAws().glue();
    const table = catalogWithDays(glue);

    // When the partitions are listed with no filter.
    const { Partitions } = glue.getPartitions(
      new GetPartitionsCommand({
        DatabaseName: table.databaseName,
        TableName: table.tableName,
      }),
    );

    // Then all four come back, as they did before filtering existed.
    assertArrayLength(Partitions, 4);
  });
});

import { assertArrayEmpty, assertArrayEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simAthenaTablePartitions,
  type SimAthenaPartitionedTable,
} from "../projection/sim-athena-table-partitions.js";
import type { SimAthenaCatalogPartition } from "./sim-athena-registered-partitions.js";

const noon = new Date("2026-08-26T12:00:00.000Z");

/** A table with no projection, laid out under its own location. */
function aTable(
  partitionKeys: readonly string[],
  location = "s3://rainlytics-logs/cloudfront/",
): SimAthenaPartitionedTable {
  return {
    parameters: {},
    partitionKeys: partitionKeys.map((Name) => ({ Name })),
    storageDescriptor: { Location: location },
  };
}

/** A table that says nothing about where its data sits. */
function aTableWithoutLocation(
  partitionKeys: readonly string[],
): SimAthenaPartitionedTable {
  return {
    parameters: {},
    partitionKeys: partitionKeys.map((Name) => ({ Name })),
    storageDescriptor: undefined,
  };
}

/** One partition the catalog holds, as a test writes it down. */
function aPartition(
  values: readonly string[],
  Location?: string,
): SimAthenaCatalogPartition {
  return {
    values,
    storageDescriptor: Location === undefined ? undefined : { Location },
  };
}

function partitionsOf(
  table: SimAthenaPartitionedTable,
  queryString = "SELECT * FROM rainlytics.access_logs",
  registered: readonly SimAthenaCatalogPartition[] = [],
): readonly string[] {
  return simAthenaTablePartitions({
    table,
    registered,
    queryString,
    now: noon,
  }).map((partition) => partition.prefix);
}

describe("the S3 prefixes a query reads for registered partitions", () => {
  it("reads one prefix per registered partition", () => {
    // Given a table with two partitions registered against it, each saying
    // where its own objects sit.
    const table = aTable(["day"]);

    // When its partitions are read.
    const prefixes = partitionsOf(table, undefined, [
      aPartition(["2026-08-25"], "s3://rainlytics-logs/day=2026-08-25/"),
      aPartition(["2026-08-26"], "s3://elsewhere/2026-08-26"),
    ]);

    // Then each partition's own location is read, whether or not it sits
    // under the table's, and each ends in a slash.
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/day=2026-08-25/",
      "s3://elsewhere/2026-08-26/",
    ]);
  });

  it("falls back to the Hive layout for a partition with no location", () => {
    // Given a table partitioned two ways, holding a partition registered
    // without a location of its own.
    const table = aTable(["day", "region"]);

    // When its partitions are read.
    const prefixes = partitionsOf(table, undefined, [
      aPartition(["2026-08-26", "eu-west-2"]),
    ]);

    // Then it sits under the table's location, one segment per key in the
    // order the table declares them.
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/cloudfront/day=2026-08-26/region=eu-west-2/",
    ]);
  });

  it("reads a registered partition short of a value as empty", () => {
    // Given a table partitioned two ways, holding a partition registered with
    // one value. The catalog writer takes the values it is given rather than
    // holding them to the table, so this reaches here.
    const table = aTable(["day", "region"]);

    // When its partitions are read.
    const prefixes = partitionsOf(table, undefined, [
      aPartition(["2026-08-26"]),
    ]);

    // Then the key it has no value for reads as empty.
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/cloudfront/day=2026-08-26/region=/",
    ]);
  });

  it("narrows registered partitions by the query's filter", () => {
    // Given a table with three days registered against it.
    const table = aTable(["day"]);
    const registered = [
      aPartition(["2026-08-24"], "s3://rainlytics-logs/day=2026-08-24/"),
      aPartition(["2026-08-25"], "s3://rainlytics-logs/day=2026-08-25/"),
      aPartition(["2026-08-26"], "s3://rainlytics-logs/day=2026-08-26/"),
    ];

    // When a query pins the day.
    const prefixes = partitionsOf(
      table,
      "SELECT * FROM rainlytics.access_logs WHERE day = '2026-08-25'",
      registered,
    );

    // Then only that day's prefix is read.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/day=2026-08-25/"]);
  });

  it("reads nothing for a partition with nowhere to look", () => {
    // Given a table with no location, holding a partition with none either.
    const table = aTableWithoutLocation(["day"]);

    // When its partitions are read.
    const prefixes = partitionsOf(table, undefined, [
      aPartition(["2026-08-26"]),
    ]);

    // Then there is nowhere to read, and the query reads nothing rather than
    // reading the wrong place.
    assertArrayEmpty(prefixes);
  });
});

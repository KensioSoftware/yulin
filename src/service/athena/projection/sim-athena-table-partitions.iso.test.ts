import {
  assertArrayEquals,
  assertArrayLength,
  assertStringIncludes,
  assertThrowsErrorLike,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAthenaCatalogPartition } from "../table/sim-athena-registered-partitions.js";
import {
  simAthenaTablePartitions,
  type SimAthenaPartitionedTable,
} from "./sim-athena-table-partitions.js";

const noon = new Date("2026-08-26T12:00:00.000Z");

function aTable(
  parameters: Record<string, string>,
  partitionKeys: readonly string[] = [],
  location = "s3://rainlytics-logs/cloudfront/",
): SimAthenaPartitionedTable {
  return {
    parameters,
    partitionKeys: partitionKeys.map((Name) => ({ Name })),
    storageDescriptor: { Location: location },
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

/** One partition the catalog holds, as a test writes it down. */
function aPartition(
  values: readonly string[],
  Location: string,
): SimAthenaCatalogPartition {
  return { values, storageDescriptor: { Location } };
}

describe("the S3 prefixes a query reads for one table", () => {
  it("reads the table's own location where it has neither", () => {
    // Given a table with no projection configured and nothing registered
    // against it.
    const table = aTable({}, ["day"]);

    // When its partitions are read.
    const prefixes = partitionsOf(table);

    // Then the table's location is the whole of it.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/cloudfront/"]);
  });

  it("reads the projected partitions where a table carries both", () => {
    // Given a table projecting one day, with a different day registered
    // against it.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.day.type": "date",
        "projection.day.format": "yyyy-MM-dd",
        "projection.day.range": "2026-08-26,2026-08-26",
      },
      ["day"],
    );

    // When its partitions are read.
    const prefixes = partitionsOf(table, undefined, [
      aPartition(["2020-01-01"], "s3://rainlytics-logs/day=2020-01-01/"),
    ]);

    // Then the projection wins. Real Athena stops reading the catalog's
    // partitions once projection is on, which is the point of turning it on.
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/cloudfront/day=2026-08-26/",
    ]);
  });

  it("fills the location template with each projected value", () => {
    // Given a table projecting three days into a template of its own.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.day.type": "date",
        "projection.day.format": "yyyy-MM-dd",
        "projection.day.range": "2026-08-24,2026-08-26",
        "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
      },
      ["day"],
    );

    // When its partitions are read.
    const prefixes = partitionsOf(table);

    // Then there is one prefix per day.
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/logs/2026-08-24/",
      "s3://rainlytics-logs/logs/2026-08-25/",
      "s3://rainlytics-logs/logs/2026-08-26/",
    ]);
  });

  it("lays partitions out Hive style where no template was given", () => {
    // Given a table projecting two regions and naming no template.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.region.type": "enum",
        "projection.region.values": "eu-west-2,us-east-1",
      },
      ["region"],
    );

    // When its partitions are read.
    const prefixes = partitionsOf(table);

    // Then each sits under the table's own location, keyed the way Hive keys
    // one, which is what Athena falls back to.
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/cloudfront/region=eu-west-2/",
      "s3://rainlytics-logs/cloudfront/region=us-east-1/",
    ]);
  });

  it("takes one prefix per combination across two columns", () => {
    // Given a table projecting two regions across two days.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.region.type": "enum",
        "projection.region.values": "eu,us",
        "projection.day.type": "date",
        "projection.day.format": "yyyy-MM-dd",
        "projection.day.range": "2026-08-25,2026-08-26",
        "storage.location.template": `s3://rainlytics-logs/\${region}/\${day}/`,
      },
      ["region", "day"],
    );

    // When its partitions are read.
    const prefixes = partitionsOf(table);

    // Then there are four, one per pair.
    assertArrayLength(prefixes, 4);
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/eu/2026-08-25/",
      "s3://rainlytics-logs/eu/2026-08-26/",
      "s3://rainlytics-logs/us/2026-08-25/",
      "s3://rainlytics-logs/us/2026-08-26/",
    ]);
  });

  it("narrows to the partitions a WHERE clause pins down", () => {
    // Given a table projecting three days.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.day.type": "date",
        "projection.day.format": "yyyy-MM-dd",
        "projection.day.range": "2026-08-24,2026-08-26",
        "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
      },
      ["day"],
    );

    // When a query filtering on one day reads them.
    const prefixes = partitionsOf(
      table,
      "SELECT * FROM rainlytics.access_logs WHERE day = '2026-08-25'",
    );

    // Then only that day's prefix is read. This is the whole point of
    // partitioning a table.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("leaves every partition in where the query negates its filter", () => {
    // Given a table projecting three days, and a query excluding one of them.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.day.type": "date",
        "projection.day.format": "yyyy-MM-dd",
        "projection.day.range": "2026-08-24,2026-08-26",
        "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
      },
      ["day"],
    );

    // When its partitions are read.
    const prefixes = partitionsOf(
      table,
      "SELECT * FROM t WHERE NOT (day = '2026-08-25')",
    );

    // Then all three stay in. Reading the negated value as a constraint would
    // answer from the one prefix the query asked to leave out.
    assertArrayLength(prefixes, 3);
  });

  it("keeps the filter where a NOT applies to another column", () => {
    // Given a table projecting three days, and the shape a rollup over access
    // logs takes: prune on the partition key, then filter bots out of what is
    // left.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.day.type": "date",
        "projection.day.format": "yyyy-MM-dd",
        "projection.day.range": "2026-08-24,2026-08-26",
        "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
      },
      ["day"],
    );

    // When its partitions are read.
    const prefixes = partitionsOf(
      table,
      "SELECT uri, count(*) FROM t WHERE day IN ('2026-08-25') " +
        "AND NOT regexp_like(lower(agent), 'bot|crawl') " +
        "GROUP BY day ORDER BY 2 DESC",
    );

    // Then the day goes on pruning. The negation says nothing about the day,
    // and the `GROUP BY` naming the same column is outside the NOT's reach.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("stops reading a NOT at the bracket it was written in", () => {
    // Given a table projecting three days.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.day.type": "date",
        "projection.day.format": "yyyy-MM-dd",
        "projection.day.range": "2026-08-24,2026-08-26",
        "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
      },
      ["day"],
    );

    // When a query negating another column inside brackets reads them.
    const prefixes = partitionsOf(
      table,
      "SELECT * FROM t WHERE (status = 200 AND NOT bot) AND day = '2026-08-25'",
    );

    // Then the day outside those brackets is still pinned down.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("keeps what two filters on one column agree on", () => {
    // Given a table projecting three days, and a query constraining the same
    // column twice.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.day.type": "date",
        "projection.day.format": "yyyy-MM-dd",
        "projection.day.range": "2026-08-24,2026-08-26",
        "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
      },
      ["day"],
    );

    // When its partitions are read.
    const prefixes = partitionsOf(
      table,
      "SELECT * FROM t WHERE day IN ('2026-08-24', '2026-08-25') " +
        "AND day IN ('2026-08-25', '2026-08-26')",
    );

    // Then only the day both terms allow is read.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("takes an injected column's values from the query", () => {
    // Given a table with an injected column, and a query naming two of them.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.tenant.type": "injected",
        "storage.location.template": `s3://rainlytics-logs/\${tenant}/`,
      },
      ["tenant"],
    );

    // When a query constraining it reads its partitions.
    const prefixes = partitionsOf(
      table,
      "SELECT * FROM t WHERE tenant IN ('acme', 'globex')",
    );

    // Then the query's own values are what it projects.
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/acme/",
      "s3://rainlytics-logs/globex/",
    ]);
  });

  it("gives a prefix its trailing slash where the template left one off", () => {
    // Given a template that ends on the placeholder itself.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.day.type": "enum",
        "projection.day.values": "2026-08-26",
        "storage.location.template": `s3://rainlytics-logs/logs/\${day}`,
      },
      ["day"],
    );

    // When its partitions are read.
    const prefixes = partitionsOf(table);

    // Then the prefix ends in a slash. A prefix without one matches the keys
    // of a sibling partition whose name starts the same way.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-26/"]);
  });

  it("refuses a table projecting with neither a template nor a location", () => {
    // Given a table with projection on and nowhere for its data to be.
    const table: SimAthenaPartitionedTable = {
      parameters: {
        "projection.enabled": "true",
        "projection.day.type": "enum",
        "projection.day.values": "2026-08-26",
      },
      partitionKeys: [{ Name: "day" }],
      storageDescriptor: undefined,
    };

    // When its partitions are read.
    // Then it is refused. There is nothing to build a prefix out of.
    const error = assertThrowsErrorLike(() => partitionsOf(table));
    assertStringIncludes(error.message, "storage.location.template");
  });

  it("reads nothing for a table with neither projection nor a location", () => {
    // Given a table with no projection and no location either.
    const table: SimAthenaPartitionedTable = {
      parameters: {},
      partitionKeys: [],
      storageDescriptor: undefined,
    };

    // When its partitions are read.
    // Then there are none. Nothing said where the data is.
    assertArrayLength(partitionsOf(table), 0);
  });

  it("refuses a query leaving an injected column unconstrained", () => {
    // Given a table with an injected column.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.tenant.type": "injected",
        "storage.location.template": `s3://rainlytics-logs/\${tenant}/`,
      },
      ["tenant"],
    );

    // When a query naming nothing about it reads its partitions.
    // Then it is refused. An injected column has no values of its own.
    const error = assertThrowsErrorLike(() => partitionsOf(table));
    assertStringIncludes(error.message, "tenant");
    assertStringIncludes(error.message, "injected");
  });

  it("refuses a template leaving out one of the projected columns", () => {
    // Given a table projecting two columns and a template naming one.
    const table = aTable(
      {
        "projection.enabled": "true",
        "projection.region.type": "enum",
        "projection.region.values": "eu",
        "projection.day.type": "enum",
        "projection.day.values": "2026-08-26",
        "storage.location.template": `s3://rainlytics-logs/\${region}/`,
      },
      ["region", "day"],
    );

    // When its partitions are read.
    // Then it is refused, naming the placeholder that is missing. Two
    // partitions would otherwise share one prefix.
    const error = assertThrowsErrorLike(() => partitionsOf(table));
    assertStringIncludes(error.message, `\${day}`);
  });
});

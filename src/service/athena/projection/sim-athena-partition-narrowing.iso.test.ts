import { assertArrayEquals, assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simAthenaTablePartitions,
  type SimAthenaPartitionedTable,
} from "./sim-athena-table-partitions.js";

const noon = new Date("2026-08-26T12:00:00.000Z");

/** A table projecting the three days of August the tests below narrow. */
function aThreeDayTable(): SimAthenaPartitionedTable {
  return {
    parameters: {
      "projection.enabled": "true",
      "projection.day.type": "date",
      "projection.day.format": "yyyy-MM-dd",
      "projection.day.range": "2026-08-24,2026-08-26",
      "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
    },
    partitionKeys: [{ Name: "day" }],
    storageDescriptor: { Location: "s3://rainlytics-logs/cloudfront/" },
  };
}

function prefixesFor(queryString: string): readonly string[] {
  return simAthenaTablePartitions({
    table: aThreeDayTable(),
    registered: [],
    queryString,
    now: noon,
  }).map((partition) => partition.prefix);
}

describe("the partitions a WHERE clause narrows a query to", () => {
  it("narrows to the partitions a WHERE clause pins down", () => {
    // Given a table projecting three days.
    // When a query filtering on one day reads them.
    const prefixes = prefixesFor(
      "SELECT * FROM rainlytics.access_logs WHERE day = '2026-08-25'",
    );

    // Then only that day's prefix is read. This is the whole point of
    // partitioning a table.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("keeps what two filters on one column agree on", () => {
    // Given a query constraining the same column twice.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE day IN ('2026-08-24', '2026-08-25') " +
        "AND day IN ('2026-08-25', '2026-08-26')",
    );

    // Then only the day both terms allow is read.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("leaves every partition in where the query negates its filter", () => {
    // Given a query excluding one of the three days.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE NOT (day = '2026-08-25')",
    );

    // Then all three stay in. Reading the negated value as a constraint would
    // answer from the one prefix the query asked to leave out.
    assertArrayLength(prefixes, 3);
  });

  it("keeps the filter where a NOT applies to another column", () => {
    // Given the shape a rollup over access logs takes: prune on the partition
    // key, then filter bots out of what is left.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT uri, count(*) FROM t WHERE day IN ('2026-08-25') " +
        "AND NOT regexp_like(lower(agent), 'bot|crawl') " +
        "GROUP BY day ORDER BY 2 DESC",
    );

    // Then the day goes on pruning. The negation says nothing about the day,
    // and the `GROUP BY` naming the same column is outside the NOT's reach.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("stops reading a NOT at the bracket it was written in", () => {
    // Given a query negating another column inside brackets.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE (status = 200 AND NOT bot) AND day = '2026-08-25'",
    );

    // Then the day outside those brackets is still pinned down.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("keeps a column's own filter where NOT IN excludes part of it", () => {
    // Given a query naming all three days and then excluding one of them.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE day IN ('2026-08-24', '2026-08-25', '2026-08-26') " +
        "AND day NOT IN ('2026-08-25')",
    );

    // Then all three are read, one more than real Athena reads. The query
    // applies the exclusion itself once the rows are in. Reading the infix
    // `NOT` as negating its own column would drop the filter and widen the
    // scan to every projected day.
    assertArrayLength(prefixes, 3);
  });
});

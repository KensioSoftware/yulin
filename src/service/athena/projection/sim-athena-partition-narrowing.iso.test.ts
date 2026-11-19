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

  it("leaves every partition in where an OR joins the filter to another term", () => {
    // Given a query asking for one day or for anything a bot fetched.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE day = '2026-08-25' OR agent LIKE '%bot%'",
    );

    // Then all three stay in. A bot's rows from the other two days answer
    // the second arm.
    assertArrayLength(prefixes, 3);
  });

  it("keeps the filter beside an OR held in brackets", () => {
    // Given the shape a rollup takes when either of two paths counts: prune
    // on the day, then keep rows matching one test or the other.
    // When its partitions are read.
    const prefixes = prefixesFor(
      String.raw`SELECT * FROM t WHERE day = '2026-08-25' AND (regexp_like(uri, '\.css$') OR strpos(uri, '/beacon') = 1)`,
    );

    // Then the day goes on pruning. The OR chooses between the two tests,
    // and every row either arm keeps still comes from that day.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("keeps the filter where the OR sits in a subquery", () => {
    // Given a query pinning the day and testing each row against a subquery
    // that chooses between two paths.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE day IN ('2026-08-25') AND visitor IN (" +
        "SELECT visitor FROM t WHERE day IN ('2026-08-25') " +
        "AND uri = '/a.css' OR uri = '/beacon')",
    );

    // Then the day outside the subquery goes on pruning.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("drops a filter inside brackets an OR splits, however deep", () => {
    // Given a day pinned in a nested bracket under one arm of an OR.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE (status = 200 OR (day = '2026-08-25' AND bot))",
    );

    // Then all three stay in. A status 200 row from any day answers the
    // first arm.
    assertArrayLength(prefixes, 3);
  });

  it("leaves every partition in where only a CASE in the select list names one", () => {
    // Given a query picking one day's value out of each row.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT max(CASE WHEN day = '2026-08-25' THEN uri END) AS uri, " +
        "min(day) AS first_day FROM t",
    );

    // Then all three stay in. The CASE leaves every row in, and the first
    // day comes from a partition the CASE never named.
    assertArrayLength(prefixes, 3);
  });

  it("leaves every partition in where a comparison sits in the select list", () => {
    // Given a query comparing the day in its select list, bare and inside a
    // function's arguments.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT day = '2026-08-24' AS first, " +
        "count_if(day IN ('2026-08-25')) AS middle FROM t",
    );

    // Then all three stay in.
    assertArrayLength(prefixes, 3);
  });

  it("leaves every partition in where an aggregate's FILTER names one", () => {
    // Given a query counting one day's rows beside a count of all of them.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT count(*) FILTER (WHERE day = '2026-08-25') AS middle, " +
        "count(*) AS every_day FROM t",
    );

    // Then all three stay in. The FILTER chooses the rows one aggregate
    // sees, and the other aggregate counts every day.
    assertArrayLength(prefixes, 3);
  });

  it("keeps the WHERE filter beside a CASE naming another day", () => {
    // Given a query pinning two days and picking one of them out of each row.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT max(CASE WHEN day = '2026-08-24' THEN uri END) FROM t " +
        "WHERE day IN ('2026-08-24', '2026-08-25')",
    );

    // Then the WHERE clause alone decides what is read.
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/logs/2026-08-24/",
      "s3://rainlytics-logs/logs/2026-08-25/",
    ]);
  });

  it("keeps the filter after an IS DISTINCT FROM comparison", () => {
    // Given a query testing another column with IS DISTINCT FROM before it
    // pins the day.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE agent IS DISTINCT FROM 'bot' " +
        "AND day = '2026-08-25'",
    );

    // Then the day goes on pruning. The FROM is part of the comparison.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("leaves every partition in where a subquery in the select list names one", () => {
    // Given a query whose select list reads one day through a subquery, bare
    // and inside a function's arguments, beside a column over every day.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT (SELECT max(uri) FROM t WHERE day = '2026-08-24') AS first, " +
        "coalesce((SELECT max(uri) FROM t WHERE day = '2026-08-25'), '') " +
        "AS middle, min(day) AS first_day FROM t",
    );

    // Then all three stay in. The subqueries' filters say nothing about the
    // rows the outer query reads.
    assertArrayLength(prefixes, 3);
  });
});

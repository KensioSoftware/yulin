import { assertArrayEquals, assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import { prefixesFor } from "./sim-athena-partition-narrowing.fixture.js";

describe("the partitions each read of a table narrows a query to", () => {
  it("leaves every partition in where only a subquery in WHERE names one", () => {
    // Given a query reading every day's rows for the visitors a subquery
    // finds on one day.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE visitor IN " +
        "(SELECT visitor FROM t WHERE day = '2026-08-25')",
    );

    // Then all three stay in. The subquery's filter narrows its own read of
    // the table, and the outer read asks for every day.
    assertArrayLength(prefixes, 3);
  });

  it("reads what each read of the table asks for", () => {
    // Given a query reading one day for the visitors a subquery finds on
    // another.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE day = '2026-08-24' AND visitor IN " +
        "(SELECT visitor FROM t WHERE day = '2026-08-25')",
    );

    // Then both days are read. Intersecting the two filters would leave
    // nothing, and either one alone would starve the other read.
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/logs/2026-08-24/",
      "s3://rainlytics-logs/logs/2026-08-25/",
    ]);
  });

  it("reads both days a UNION asks for", () => {
    // Given a query joining two days' rows with a UNION.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT uri FROM t WHERE day = '2026-08-24' " +
        "UNION ALL SELECT uri FROM t WHERE day = '2026-08-25'",
    );

    // Then each half reads its own day.
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/logs/2026-08-24/",
      "s3://rainlytics-logs/logs/2026-08-25/",
    ]);
  });

  it("leaves every partition in where a filter reads another table", () => {
    // Given a query testing each row against a subquery on another table.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE visitor IN " +
        "(SELECT visitor FROM rainlytics.signups WHERE day = '2026-08-25')",
    );

    // Then all three stay in. The other table's filter says nothing about
    // this one.
    assertArrayLength(prefixes, 3);
  });

  it("narrows a subquery in FROM by the query around it", () => {
    // Given a query filtering the rows a subquery in its FROM produces.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM (SELECT uri, day FROM t) WHERE day = '2026-08-25'",
    );

    // Then only that day is read, as Athena pushes the filter down into the
    // subquery.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("reads every partition a UNION in FROM asks for", () => {
    // Given a query filtering both halves of a UNION in its FROM.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM (SELECT uri, day FROM t UNION ALL " +
        "SELECT uri, day FROM t) WHERE day = '2026-08-25'",
    );

    // Then the filter reaches both halves.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-25/"]);
  });

  it("keeps a subquery after IS DISTINCT FROM to its own filter", () => {
    // Given a query comparing each row to a value a subquery reads from
    // another day.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE day = '2026-08-24' AND visitor IS DISTINCT FROM " +
        "(SELECT max(visitor) FROM t WHERE day = '2026-08-25')",
    );

    // Then both days are read. The subquery is a value, and the outer
    // filter says nothing about its read.
    assertArrayEquals(prefixes, [
      "s3://rainlytics-logs/logs/2026-08-24/",
      "s3://rainlytics-logs/logs/2026-08-25/",
    ]);
  });

  it("keeps one half of a UNION's filter beside an OR in the other", () => {
    // Given a UNION whose second half chooses between two paths.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT uri FROM t WHERE day = '2026-08-24' UNION ALL " +
        "SELECT uri FROM rainlytics.signups WHERE uri = '/a' OR uri = '/b'",
    );

    // Then the first half goes on pruning.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-24/"]);
  });

  it("keeps the outer filter where a NOT sits in a subquery", () => {
    // Given a query pinning the day and testing each row against a subquery
    // negating the day on another table.
    // When its partitions are read.
    const prefixes = prefixesFor(
      "SELECT * FROM t WHERE day = '2026-08-24' AND EXISTS " +
        "(SELECT 1 FROM rainlytics.signups WHERE NOT (day = '2026-08-25'))",
    );

    // Then the outer day goes on pruning. The NOT negates only the
    // subquery's own filter.
    assertArrayEquals(prefixes, ["s3://rainlytics-logs/logs/2026-08-24/"]);
  });
});

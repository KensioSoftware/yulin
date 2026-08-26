import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAthenaTableReferences } from "./sim-athena-table-references.js";

/** The table names one query comes to, qualified as the query wrote them. */
function namesIn(sql: string): readonly string[] {
  return simAthenaTableReferences(sql).references.map((reference) =>
    [reference.catalog, reference.database, reference.name]
      .filter((part) => part !== undefined)
      .join("."),
  );
}

describe("reading the tables an Athena query names", () => {
  it("reads a qualified name and an unqualified one", () => {
    // Given a query naming one table each way.
    // When its table names are read.
    const names = namesIn(
      "SELECT * FROM rainlytics.access_logs JOIN sessions ON 1 = 1",
    );

    // Then both come back, each carrying only the parts the query wrote.
    assertArrayEquals(names, ["rainlytics.access_logs", "sessions"]);
  });

  it("keeps the case a quoted identifier was given and folds an unquoted one", () => {
    // Given a query naming one table quoted and one bare, both mixed case.
    // When its table names are read.
    const names = namesIn('SELECT * FROM "Rainlytics"."Access_Logs", Sessions');

    // Then the quoted name keeps its case, as quoting it asks, and the bare
    // one folds down the way Athena folds it.
    assertArrayEquals(names, ["Rainlytics.Access_Logs", "sessions"]);
  });

  it("leaves a name a WITH clause defined out", () => {
    // Given a query whose FROM names a common table expression.
    // When its table names are read.
    const names = namesIn(
      "WITH errors AS (SELECT url FROM rainlytics.access_logs) " +
        "SELECT count(*) FROM errors",
    );

    // Then only the catalog table is named. A CTE is no catalog entry.
    assertArrayEquals(names, ["rainlytics.access_logs"]);
  });

  it("leaves an alias and a subquery out", () => {
    // Given a query aliasing a table and selecting from a subquery.
    // When its table names are read.
    const names = namesIn(
      "SELECT o.id FROM (SELECT id FROM shop.orders) o " +
        "JOIN shop.customers AS c ON 1 = 1",
    );

    // Then the two real tables come back, and neither the alias nor the
    // subquery does.
    assertArrayEquals(names, ["shop.orders", "shop.customers"]);
  });

  it("reads two tables a comma separates, and none a subquery's commas hold", () => {
    // Given a FROM naming two tables, one of them a subquery selecting several
    // columns, and a WHERE clause with a comma of its own.
    // When its table names are read.
    const names = namesIn(
      "SELECT * FROM (SELECT id, total FROM shop.orders) o, shop.customers c " +
        "WHERE c.id IN (1, 2)",
    );

    // Then the two real tables come back. A comma inside brackets separates
    // columns rather than tables.
    assertArrayEquals(names, ["shop.orders", "shop.customers"]);
  });

  it("leaves the FROM inside a function call alone", () => {
    // Given a query using EXTRACT, which writes FROM inside its own brackets.
    // When its table names are read.
    const names = namesIn(
      "SELECT extract(hour FROM ts), substring(url FROM 2) " +
        "FROM rainlytics.access_logs",
    );

    // Then only the table is named. Reading `ts` as a table would refuse a
    // query real Athena runs.
    assertArrayEquals(names, ["rainlytics.access_logs"]);
  });

  it("leaves what UNNEST produces out", () => {
    // Given a query flattening an array column.
    // When its table names are read.
    const names = namesIn(
      "SELECT t.tag FROM app.events CROSS JOIN UNNEST(tags) AS t(tag)",
    );

    // Then the events table is named on its own.
    assertArrayEquals(names, ["app.events"]);
  });

  it("ignores a keyword sitting inside a string or a comment", () => {
    // Given a query with FROM inside a literal and inside both comment forms.
    // When its table names are read.
    const names = namesIn(
      "SELECT 'from nowhere' -- from a line comment\n" +
        "/* from a block comment */ FROM rainlytics.access_logs",
    );

    // Then only the real table is named.
    assertArrayEquals(names, ["rainlytics.access_logs"]);
  });

  it("reads a three part name as a catalog, a database and a table", () => {
    // Given a query naming a federated catalog.
    // When its table names are read.
    const read = simAthenaTableReferences(
      "SELECT * FROM hive.rainlytics.access_logs",
    );

    // Then all three parts are kept apart, so a caller can tell the Data
    // Catalog from another one.
    assertArrayLength(read.references, 1);
    assertIdentical(read.references[0].catalog, "hive");
    assertIdentical(read.references[0].database, "rainlytics");
    assertIdentical(read.references[0].name, "access_logs");
  });

  it("reports a statement it cannot follow rather than guessing", () => {
    // Given statements that write data, that are not SELECT at all, and one
    // whose string literal never closes.
    // When each is read.
    const unreadable = [
      "MSCK REPAIR TABLE rainlytics.access_logs",
      "CREATE TABLE t AS SELECT * FROM rainlytics.access_logs",
      "SHOW PARTITIONS rainlytics.access_logs",
      "SELECT * FROM rainlytics.access_logs WHERE url = 'unclosed",
      "SELECT * FROM",
    ];

    // Then none of them is readable, and nothing is resolved for one.
    for (const sql of unreadable) {
      assertFalse(simAthenaTableReferences(sql).readable, sql);
      assertArrayLength(simAthenaTableReferences(sql).references, 0, sql);
    }
  });

  it("reads a query naming no table at all", () => {
    // Given a query with no FROM clause.
    // When it is read.
    const read = simAthenaTableReferences("SELECT 1");

    // Then it is readable and names nothing.
    assertTrue(read.readable);
    assertArrayLength(read.references, 0);
  });
});

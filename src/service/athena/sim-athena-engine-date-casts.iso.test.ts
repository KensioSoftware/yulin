import {
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import { aSnapshotSimulation } from "./sim-athena-snapshot-table.fixture.js";

describe("casting to DATE in the simulated Athena query engine", () => {
  it("reads a partition column cast to DATE as the date it holds", async () => {
    // Given snapshots partitioned by a string day.
    const simulation = await aSnapshotSimulation();

    // When a query casts the day to a DATE, and calls date() on it too.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT DISTINCT CAST(day AS DATE) AS cast_day, date(day) AS date_day " +
        "FROM rainlytics.snapshots",
    );

    // Then both answer with the whole date. SQLite's own cast to DATE keeps
    // the leading number and answers 2026.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["2026-08-15", "2026-08-15"]]);
  });

  it("rewrites a cast nested inside another", async () => {
    // Given snapshots carrying a column that holds no date.
    const simulation = await aSnapshotSimulation();

    // When a query wraps date() of that column inside another date().
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT date(date(sku)) AS made_on FROM rainlytics.snapshots",
    );

    // Then the inner call fails the query too. Left to SQLite it would answer
    // null, and the outer cast would pass the null through.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason, "Value cannot be cast to date: bolt");
  });

  it("moves a cast day and casts it back to VARCHAR", async () => {
    // Given snapshots partitioned by a string day.
    const simulation = await aSnapshotSimulation();

    // When a query takes the day before each snapshot's day, measures the gap
    // and compares the cast day against a DATE literal.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT DISTINCT " +
        "CAST(date_add('day', -1, CAST(day AS DATE)) AS VARCHAR) AS before, " +
        "date_diff('day', CAST('2026-08-01' AS DATE), CAST(day AS DATE)) AS gap " +
        "FROM rainlytics.snapshots " +
        "WHERE CAST(day AS DATE) > DATE '2026-08-14'",
    );

    // Then each answers as Athena does over the date 2026-08-15.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["2026-08-14", "14"]]);
  });

  it("counts rows against the day before inside an aggregate", async () => {
    // Given snapshots taken on the partition day and on the day before it.
    const simulation = await aSnapshotSimulation();

    // When a grouped count compares each timestamp with the day before.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT day, sum(CASE WHEN substr(taken_at, 1, 10) = " +
        "CAST(date_add('day', -1, CAST(day AS DATE)) AS VARCHAR) " +
        "THEN 1 ELSE 0 END) AS day_before " +
        "FROM rainlytics.snapshots GROUP BY day",
    );

    // Then the one snapshot taken the day before is counted.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["2026-08-15", "1"]]);
  });

  it("keeps the date of a timestamp cast to DATE", async () => {
    // Given snapshots carrying a Glue timestamp column.
    const simulation = await aSnapshotSimulation();

    // When a query casts the timestamp to a DATE, and calls date() on it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, CAST(taken_at AS DATE) AS taken_on, date(taken_at) AS d " +
        "FROM rainlytics.snapshots ORDER BY sku",
    );

    // Then the date part answers, as Trino's cast of a timestamp does.
    assertObjectEquals(answered.rows, [
      ["bolt", "2026-08-15", "2026-08-15"],
      ["nut", "2026-08-14", "2026-08-14"],
    ]);
  });

  it("reads text the way Trino's cast from varchar does", async () => {
    // Given snapshots, with a lenient engine and a default declaration.
    const simulation = await aSnapshotSimulation();

    // When a query casts a date with spaces around it to a DATE.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT DISTINCT CAST(' 2026-08-05 ' AS DATE) AS d " +
        "FROM rainlytics.snapshots",
    );

    // Then the cast trims the text before reading it, as Trino's does.
    assertObjectEquals(answered.rows, [["2026-08-05"]]);
  });

  it("fails a cast to DATE of text carrying a time", async () => {
    // Given snapshots whose noted_at is text holding a date and a time.
    const simulation = await aSnapshotSimulation();

    // When a query casts that text to a DATE.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT CAST(noted_at AS DATE) AS noted_on FROM rainlytics.snapshots",
    );

    // Then the query fails. Trino reads only a date out of text, and only a
    // timestamp value loses its time to the cast.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(
      answered.reason,
      "Value cannot be cast to date: 2026-08-15 10:00:00",
    );
  });

  it("fails a cast to DATE of a day the calendar has not got", async () => {
    // Given snapshots, with a lenient engine.
    const simulation = await aSnapshotSimulation();

    // When a query casts the 30th of February.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT CAST('2026-02-30' AS DATE) AS d FROM rainlytics.snapshots",
    );

    // Then the query fails rather than rolling over into March.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason, "Value cannot be cast to date");
  });

  it("fails a cast of text that is no date, with the engine lenient", async () => {
    // Given snapshots, with a lenient engine and a default declaration.
    const simulation = await aSnapshotSimulation();

    // When a query casts a column holding no date to a DATE.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT CAST(sku AS DATE) AS made_on FROM rainlytics.snapshots",
    );

    // Then the query fails with the reason. Trino fails the cast, and falling
    // back would answer with the declaration's rows.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason, "CAST(... AS DATE)");
    assertStringIncludes(answered.reason, "Value cannot be cast to date: bolt");
  });

  it("fails date() over text that is no date, as the cast it names", async () => {
    // Given snapshots, with a lenient engine and a default declaration.
    const simulation = await aSnapshotSimulation();

    // When a query calls date() on a column holding no date.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT date(sku) AS made_on FROM rainlytics.snapshots",
    );

    // Then the query fails as the cast does. SQLite's own date() would
    // answer null for every row.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason, "Value cannot be cast to date: bolt");
  });

  it("fails a function that will not guess, with the engine lenient", async () => {
    // Given snapshots, with a lenient engine and a default declaration.
    const simulation = await aSnapshotSimulation();

    // When a query names a unit Trino does not have.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT date_add('fortnight', 1, CAST(day AS DATE)) AS later " +
        "FROM rainlytics.snapshots",
    );

    // Then the query fails and names the function. Answering from the
    // default would lose every row without saying so.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason, "date_add");
    assertStringIncludes(answered.reason, "fortnight is no date unit");
  });

  it("answers from a declaration written against the exact query", async () => {
    // Given snapshots, and a declaration for one query the engine cannot
    // evaluate.
    const simulation = await aSnapshotSimulation();
    const query =
      "SELECT CAST(sku AS DATE) AS made_on FROM rainlytics.snapshots";

    simulation.simAws
      .athena()
      .results()
      .onQuery(query, { columns: ["made_on"], rows: [["2026-01-01"]] });

    // When that query runs.
    const answered = await anAnsweredQuery(simulation, query);

    // Then the declaration answers it.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["2026-01-01"]]);
  });
});

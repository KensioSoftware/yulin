import {
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";

describe("casting to DATE in the simulated Athena query engine", () => {
  /**
   * A table of snapshots partitioned by a string `day`, with the engine on and
   * a default declaration that a fallback would answer with.
   */
  async function aSnapshotSimulation(): Promise<SimAthenaEngineSimulation> {
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "snapshots",
      columns: [
        { Name: "sku", Type: "string" },
        { Name: "taken_at", Type: "string" },
      ],
      partitionKeys: [{ Name: "day", Type: "string" }],
    });

    await aSeededJson(
      simulation.simAws,
      "snapshots/day=2026-08-15/part-0.json",
      [
        { sku: "bolt", taken_at: "2026-08-15T23:30:00Z" },
        { sku: "nut", taken_at: "2026-08-14T08:00:00Z" },
      ],
    );
    await simulation.simAws.athena().engine().enable();
    simulation.simAws
      .athena()
      .results()
      .byDefault({ columns: ["fallback"], rows: [["declared"]] });

    return simulation;
  }

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
    // Given snapshots carrying an ISO-8601 timestamp in a data column.
    const simulation = await aSnapshotSimulation();

    // When a query casts the timestamp to a DATE.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, CAST(taken_at AS DATE) AS taken_on " +
        "FROM rainlytics.snapshots ORDER BY sku",
    );

    // Then the date part answers, as Trino's cast of a timestamp does.
    assertObjectEquals(answered.rows, [
      ["bolt", "2026-08-15"],
      ["nut", "2026-08-14"],
    ]);
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
    assertStringIncludes(answered.reason, "is no ISO-8601 timestamp");
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
    assertStringIncludes(answered.reason, "is no ISO-8601 timestamp");
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

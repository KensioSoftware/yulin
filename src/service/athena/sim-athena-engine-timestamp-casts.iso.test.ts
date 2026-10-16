import {
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import { aSnapshotSimulation } from "./sim-athena-snapshot-table.fixture.js";

describe("casting to TIMESTAMP in the simulated Athena query engine", () => {
  it("reads text cast to TIMESTAMP to the millisecond", async () => {
    // Given snapshots whose noted_at is text holding a date and a time.
    const simulation = await aSnapshotSimulation();

    // When a query casts that text to a TIMESTAMP.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, CAST(noted_at AS TIMESTAMP) AS noted " +
        "FROM rainlytics.snapshots ORDER BY sku",
    );

    // Then each renders the way Athena renders a timestamp, to three places.
    // SQLite's own cast answers 2026.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["bolt", "2026-08-15 10:00:00.000"],
      ["nut", "2026-08-14 09:15:00.500"],
    ]);
  });

  it("starts a cast date at midnight and moves it by the hour", async () => {
    // Given snapshots partitioned by a string day.
    const simulation = await aSnapshotSimulation();

    // When a query casts the day to a TIMESTAMP and adds an hour.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT DISTINCT CAST(day AS TIMESTAMP) AS midnight, " +
        "date_add('hour', 1, CAST(day AS TIMESTAMP)) AS later " +
        "FROM rainlytics.snapshots",
    );

    // Then the day starts at midnight, and the hour moves it on.
    assertObjectEquals(answered.rows, [
      ["2026-08-15 00:00:00.000", "2026-08-15 01:00:00.000"],
    ]);
  });

  it("renders a timestamp column cast to TIMESTAMP as Athena does", async () => {
    // Given snapshots carrying a Glue timestamp written with a T and a Z.
    const simulation = await aSnapshotSimulation();

    // When a query casts the column to a TIMESTAMP.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, CAST(taken_at AS TIMESTAMP) AS taken " +
        "FROM rainlytics.snapshots ORDER BY sku",
    );

    // Then the value is already a timestamp, and it renders in Athena's form.
    assertObjectEquals(answered.rows, [
      ["bolt", "2026-08-15 23:30:00.000"],
      ["nut", "2026-08-14 08:00:00.000"],
    ]);
  });

  it("rounds a fraction finer than the millisecond", async () => {
    // Given snapshots, with the engine on.
    const simulation = await aSnapshotSimulation();

    // When a query casts text written to four places.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT DISTINCT CAST('2026-08-15 10:00:59.9996' AS TIMESTAMP) AS t " +
        "FROM rainlytics.snapshots",
    );

    // Then it rounds to the millisecond Athena keeps, carrying into the
    // minute.
    assertObjectEquals(answered.rows, [["2026-08-15 10:01:00.000"]]);
  });

  it("fails a cast of text written with a T", async () => {
    // Given snapshots, with a lenient engine and a default declaration.
    const simulation = await aSnapshotSimulation();

    // When a query casts ISO-8601 text with a T and a Z to a TIMESTAMP.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT CAST('2026-08-15T10:00:00Z' AS TIMESTAMP) AS t " +
        "FROM rainlytics.snapshots",
    );

    // Then the query fails. Trino reads a space between the date and the
    // time, and a zone belongs to TIMESTAMP WITH TIME ZONE.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason, "CAST(... AS TIMESTAMP)");
    assertStringIncludes(
      answered.reason,
      "Value cannot be cast to timestamp: 2026-08-15T10:00:00Z",
    );
  });

  it("fails a cast of text holding an hour the clock has not got", async () => {
    // Given snapshots, with a lenient engine.
    const simulation = await aSnapshotSimulation();

    // When a query casts the 25th hour.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT CAST('2026-08-15 25:00:00' AS TIMESTAMP) AS t " +
        "FROM rainlytics.snapshots",
    );

    // Then the query fails rather than rolling over into the next day.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason, "Value cannot be cast to timestamp");
  });
});

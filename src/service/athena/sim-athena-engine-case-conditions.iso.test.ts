import { assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  logsBucket,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";
import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";

/** A day-partitioned table holding one reader's word counts on three days. */
async function aWordCountSimulation(): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "reader_days",
    columns: [
      { Name: "reader", Type: "string" },
      { Name: "plan", Type: "string" },
      { Name: "words", Type: "int" },
    ],
    partitionKeys: [{ Name: "day", Type: "string" }],
    parameters: {
      "projection.enabled": "true",
      "projection.day.type": "date",
      "projection.day.format": "yyyy-MM-dd",
      "projection.day.range": "2026-09-10,2026-09-14",
      "storage.location.template": `s3://${logsBucket}/reader_days/\${day}/`,
    },
  });

  const wordsByDay = [
    ["2026-09-10", 299],
    ["2026-09-11", 300],
    ["2026-09-14", 300],
  ] as const;

  await Promise.all(
    wordsByDay.map(([day, words]) =>
      aSeededJson(simulation.simAws, `reader_days/${day}/part-0.json`, [
        { reader: "reader-a", plan: "free", words },
      ]),
    ),
  );

  await simulation.simAws.athena().engine().enable();

  return simulation;
}

describe("a partition column tested inside a CASE", () => {
  it("gives each grouped aggregate over a CASE its own answer", async () => {
    // Given a reader who reached 300 words on the 11th and again on the 14th.
    const simulation = await aWordCountSimulation();

    // When one aggregate picks out the 14th's plan and another the first day
    // the reader reached 300 words.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT reader, " +
        "max(CASE WHEN day = '2026-09-14' THEN plan END) AS latest_plan, " +
        "min(CASE WHEN words >= 300 THEN day END) AS first_full_day " +
        "FROM rainlytics.reader_days GROUP BY reader",
    );

    // Then the first full day is the 11th. The CASE testing the day picks a
    // value out of each row and filters none of them out, so every day is
    // read.
    assertObjectEquals(answered.rows, [["reader-a", "free", "2026-09-11"]]);
  });

  it("reads every partition where only a CASE in the select list names one", async () => {
    // Given the same three days.
    const simulation = await aWordCountSimulation();

    // When the only test of the day is the condition of a CASE.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT count(*) AS days, " +
        "sum(CASE WHEN day = '2026-09-14' THEN words ELSE 0 END) AS latest " +
        "FROM rainlytics.reader_days",
    );

    // Then all three rows are counted.
    assertObjectEquals(answered.rows, [["3", "300"]]);
  });
});

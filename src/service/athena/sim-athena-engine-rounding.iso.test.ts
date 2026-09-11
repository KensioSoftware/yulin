import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";

const hits = [
  { served: 1, asked: 4 },
  { served: 2506, asked: 100 },
];

/** A simulation holding two rows of counts, with the engine on. */
async function aCountsSimulation(): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "hits",
    columns: [
      { Name: "served", Type: "bigint" },
      { Name: "asked", Type: "bigint" },
    ],
  });

  await aSeededJson(simulation.simAws, "hits/part-0.json", hits);
  await simulation.simAws.athena().engine().enable();
  simulation.simAws
    .athena()
    .results()
    .byDefault({ columns: ["fallback"], rows: [["declared"]] });

  return simulation;
}

describe("the scale a rounded Athena result keeps", () => {
  it("keeps the decimal places a rounded percentage was asked for", async () => {
    // Given a simulation holding counts the engine can read.
    const simulation = await aCountsSimulation();

    // When a query rounds a percentage to one decimal place.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT round(100.0 * served / asked, 1) AS pct " +
        "FROM rainlytics.hits ORDER BY served",
    );

    // Then the whole number keeps its trailing zero, as Trino renders one.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["25.0"], ["2506.0"]]);
  });

  it("rounds to the place it was asked for rather than to the nearest whole", async () => {
    // Given a simulation holding counts the engine can read.
    const simulation = await aCountsSimulation();

    // When a query rounds a value that has more places than it keeps.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT round(25.06, 1) AS pct FROM rainlytics.hits LIMIT 1",
    );

    // Then it keeps one place.
    assertObjectEquals(answered.rows, [["25.1"]]);
  });

  it("reports a rounded column as a double", async () => {
    // Given a simulation holding counts the engine can read.
    const simulation = await aCountsSimulation();

    // When a query rounds a value that lands on a whole number.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT round(25, 1) AS pct FROM rainlytics.hits LIMIT 1",
    );

    // Then the column is a double rather than the bigint its value looks like.
    assertObjectEquals(answered.columns, ["double"]);
    assertObjectEquals(answered.rows, [["25.0"]]);
  });

  it("leaves a round with no scale alone", async () => {
    // Given a simulation holding counts the engine can read.
    const simulation = await aCountsSimulation();

    // When a query rounds to the nearest whole number.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT round(25) AS a, round(25.4) AS b FROM rainlytics.hits LIMIT 1",
    );

    // Then neither grows a decimal place it was never asked for.
    assertObjectEquals(answered.rows, [["25", "25"]]);
  });
});

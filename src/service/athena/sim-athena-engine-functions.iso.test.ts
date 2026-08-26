import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";

const frozen = new Date("2026-08-26T09:15:00.000Z");

const requests = [
  { at: "2026-08-24T10:00:00Z", url: "https://rain.example/a?tenant=acme" },
  { at: "2026-08-26T11:00:00Z", url: "https://rain.example/b?tenant=zed" },
];

/** A simulation holding the requests, with time frozen and the engine on. */
async function aRequestSimulation(): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation(new SimFixedClock(frozen));

  aCatalogTable(simulation.simAws, {
    name: "requests",
    columns: [
      { Name: "at", Type: "timestamp" },
      { Name: "url", Type: "string" },
    ],
  });

  await aSeededJson(simulation.simAws, "requests/part-0.json", requests);
  await simulation.simAws.athena().engine().enable();
  simulation.simAws
    .athena()
    .results()
    .byDefault({ columns: ["fallback"], rows: [["declared"]] });

  return simulation;
}

describe("the Trino functions a query reaches for", () => {
  it("reads the clock the simulation froze rather than the host's", async () => {
    // Given a simulation whose clock is frozen.
    const simulation = await aRequestSimulation();

    // When a query asks how old each request is.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT date_diff('day', at, current_timestamp) AS age " +
        "FROM rainlytics.requests ORDER BY at",
    );

    // Then the answer is measured against the frozen instant, so the same
    // test answers the same way on every run and on every machine.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["1"], ["0"]]);
  });

  it("reads a URL apart and rolls the parts up", async () => {
    // Given the requests, with the engine on.
    const simulation = await aRequestSimulation();

    // When a query groups on a piece of the URL.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT url_extract_parameter(url, 'tenant') AS tenant, " +
        "url_extract_path(url) AS path FROM rainlytics.requests " +
        "WHERE url_extract_host(url) = 'rain.example' ORDER BY tenant",
    );

    // Then each part reads, and the filter on the host is real.
    assertObjectEquals(answered.rows, [
      ["acme", "/a"],
      ["zed", "/b"],
    ]);
  });

  it("collects a column into an array and flattens it again", async () => {
    // Given the requests, with the engine on.
    const simulation = await aRequestSimulation();

    // When a query collects the paths and counts them.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT cardinality(array_agg(url_extract_path(url))) AS paths " +
        "FROM rainlytics.requests",
    );

    // Then the collected array is the JSON text an array column is held as,
    // so the array functions reach into it.
    assertObjectEquals(answered.rows, [["2"]]);
  });

  it("falls back where a function has no shim behind it", async () => {
    // Given the requests, with the engine on.
    const simulation = await aRequestSimulation();

    // When a query reaches for a Trino function nobody has shimmed.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT word_stem(url) AS stem FROM rainlytics.requests",
    );

    // Then the declaration answers it. SQLite refuses a function it has never
    // heard of, which is a refusal rather than a wrong answer.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("falls back where a shim will not guess", async () => {
    // Given the requests, with the engine on.
    const simulation = await aRequestSimulation();

    // When a query names a unit Trino does not have.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT date_add('fortnight', 1, at) AS later FROM rainlytics.requests",
    );

    // Then the declaration answers it. A shim that cannot answer faithfully
    // raises, and raising turns the query down.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });
});

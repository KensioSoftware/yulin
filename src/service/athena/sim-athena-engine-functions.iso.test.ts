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

const visits = [
  { c_ip: "198.51.100.7", cs_user_agent: "Firefox" },
  { c_ip: "198.51.100.7", cs_user_agent: "Firefox" },
  { c_ip: "198.51.100.7", cs_user_agent: "Safari" },
  { c_ip: "203.0.113.4", cs_user_agent: "Safari" },
];

/** A simulation holding the access log rows, with the engine on. */
async function aVisitSimulation(): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "visits",
    columns: [
      { Name: "c_ip", Type: "string" },
      { Name: "cs_user_agent", Type: "string" },
    ],
  });

  await aSeededJson(simulation.simAws, "visits/part-0.json", visits);
  await simulation.simAws.athena().engine().enable();
  simulation.simAws
    .athena()
    .results()
    .byDefault({ columns: ["fallback"], rows: [["declared"]] });

  return simulation;
}

describe("counting unique visitors from a salted digest", () => {
  it("hashes each visitor and counts the digests", async () => {
    // Given four rows carrying three distinct address and agent pairs.
    const simulation = await aVisitSimulation();

    // When they are counted the way an analytics query counts a visitor,
    // hashing the pair behind a salt so no address is kept.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT count(DISTINCT to_hex(sha256(to_utf8(" +
        "concat('pepper', '|', c_ip, '|', cs_user_agent))))) AS visitors " +
        "FROM rainlytics.visits",
    );

    // Then the engine answers it, and three distinct pairs come to three
    // distinct digests.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["3"]]);
  });

  it("counts a distinct expression as well as a distinct column", async () => {
    // Given the same rows.
    const simulation = await aVisitSimulation();

    // When each of the three shapes of count is asked for.
    const column = await anAnsweredQuery(
      simulation,
      "SELECT count(DISTINCT c_ip) AS v FROM rainlytics.visits",
    );
    const expression = await anAnsweredQuery(
      simulation,
      "SELECT count(DISTINCT concat(c_ip, '|', cs_user_agent)) AS v " +
        "FROM rainlytics.visits",
    );
    const approximate = await anAnsweredQuery(
      simulation,
      "SELECT approx_distinct(concat(c_ip, '|', cs_user_agent)) AS v " +
        "FROM rainlytics.visits",
    );

    // Then all three run. The parser's Athena grammar takes a column after
    // DISTINCT and nothing else, so the middle one is rewritten onto an
    // aggregate of the simulator's own rather than turned down.
    assertObjectEquals(column.rows, [["2"]]);
    assertObjectEquals(expression.rows, [["3"]]);
    assertObjectEquals(approximate.rows, [["3"]]);
  });

  it("counts distinct digests by their bytes", async () => {
    // Given the same rows.
    const simulation = await aVisitSimulation();

    // When the digests are counted without a `to_hex` around them.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT count(DISTINCT sha256(to_utf8(concat(c_ip, cs_user_agent)))) " +
        "AS visitors FROM rainlytics.visits",
    );

    // Then the count is the same three. A digest is a blob here, and two rows
    // carrying the same bytes are one value.
    assertObjectEquals(answered.rows, [["3"]]);
  });

  it("turns down a statement whose parentheses do not close", async () => {
    // Given the same rows.
    const simulation = await aVisitSimulation();

    // When a query leaves a parenthesis open.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT count(DISTINCT lower(c_ip) FROM rainlytics.visits",
    );

    // Then the declaration answers it. The rewrite finds no closing
    // parenthesis, leaves the call as it was written, and the parser refuses
    // the statement.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("leaves a count written inside a string literal alone", async () => {
    // Given the same rows.
    const simulation = await aVisitSimulation();

    // When a query compares a column against text that reads like one of
    // these calls.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT count(DISTINCT lower(c_ip)) AS v FROM rainlytics.visits " +
        "WHERE cs_user_agent <> 'count(DISTINCT lower(x))'",
    );

    // Then the rewrite reaches the call and not the literal, so the
    // comparison is still made against the text somebody wrote.
    assertObjectEquals(answered.rows, [["2"]]);
  });
});

describe("capping a count the way a rule caps one", () => {
  it("caps a count per group and leaves a smaller one alone", async () => {
    // Given four rows, three of them from the one address.
    const simulation = await aVisitSimulation();

    // When each address is counted under a cap of two.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT c_ip, least(count(*), 2) AS counted FROM rainlytics.visits " +
        "GROUP BY c_ip ORDER BY c_ip",
    );

    // Then the engine runs the cap rather than reading back a declaration,
    // which is what a rule written as a CASE was standing in for.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["198.51.100.7", "2"],
      ["203.0.113.4", "1"],
    ]);
  });

  it("takes a floor under a count as well", async () => {
    // Given the same rows.
    const simulation = await aVisitSimulation();

    // When the count is held up to sixty.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT greatest(count(*), 60) AS counted FROM rainlytics.visits",
    );

    // Then the larger of the two answers.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["60"]]);
  });
});

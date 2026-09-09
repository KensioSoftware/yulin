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

/** Three order lines over two SKUs, so a sort has something to get wrong. */
const someLines = [
  { sku: "aerial", qty: 1, revenue_total: 4 },
  { sku: "aerial", qty: 2, revenue_total: 6 },
  { sku: "brolly", qty: 9, revenue_total: 1 },
];

/**
 * A simulation over one lines table, with a default declaration behind it.
 *
 * The declaration is what a lenient engine falls back to. A statement Athena
 * refuses has to get past it whichever mode the engine is in, and these tests
 * have to be able to see that happen.
 */
async function aLinesSimulation(
  strict: boolean,
): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "lines",
    columns: [
      { Name: "sku", Type: "string" },
      { Name: "qty", Type: "int" },
      { Name: "revenue_total", Type: "int" },
    ],
  });

  await aSeededJson(simulation.simAws, "lines/part-0.json", someLines);

  simulation.simAws
    .athena()
    .results()
    .byDefault({ columns: ["sku"], rows: [["declared"]] });

  await simulation.simAws.athena().engine().enable({ strict });

  return simulation;
}

/** The statement Athena refuses, which SQLite runs and orders correctly. */
const aggregateOverAlias =
  "SELECT sku, coalesce(sum(qty), 0) AS qty FROM rainlytics.lines " +
  "GROUP BY sku ORDER BY sum(qty) DESC";

describe("a statement Athena refuses", () => {
  it("fails a strict engine, naming the alias", async () => {
    // Given a strict engine over a lines table.
    const simulation = await aLinesSimulation(true);

    // When a statement sorts by an aggregate over its own aggregate alias.
    const answered = await anAnsweredQuery(simulation, aggregateOverAlias);

    // Then the query failed, and the reason names the alias and what the
    // service says about it. SQLite would have run this and ordered it right.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason ?? "", "qty");
    assertStringIncludes(
      answered.reason ?? "",
      "Invalid reference to output projection attribute",
    );
  });

  it("fails a lenient engine too", async () => {
    // Given an engine turned on without strict mode.
    const simulation = await aLinesSimulation(false);

    // When the same statement runs.
    const answered = await anAnsweredQuery(simulation, aggregateOverAlias);

    // Then the default declaration did not take it. A turn-down means the
    // engine reached its limits and a declaration is the right answer. This is
    // SQL the service would have refused, and a green test on it is the whole
    // problem.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(
      answered.reason ?? "",
      "Athena refuses this statement",
    );
  });

  it("answers the same select list sorted by the alias", async () => {
    // Given a strict engine over the same table.
    const simulation = await aLinesSimulation(true);

    // When the sort names the output alias with no aggregate around it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, coalesce(sum(qty), 0) AS qty FROM rainlytics.lines " +
        "GROUP BY sku ORDER BY qty DESC",
    );

    // Then the query ran and sorted by the summed quantity. This is the form
    // Athena takes, and it is what the refused statement should have said.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["brolly", "9"],
      ["aerial", "3"],
    ]);
  });

  it("answers an aggregate over a column the select list leaves alone", async () => {
    // Given a strict engine over the same table.
    const simulation = await aLinesSimulation(true);

    // When the sort aggregates a column, and the select list aliases its own
    // aggregate to a different name.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, coalesce(sum(revenue_total), 0) AS revenue " +
        "FROM rainlytics.lines GROUP BY sku ORDER BY sum(revenue_total) DESC",
    );

    // Then it ran. Nothing shadows anything here and Athena takes this
    // statement, which is what stops the check from banning aggregates in
    // ORDER BY outright.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["aerial", "10"],
      ["brolly", "1"],
    ]);
  });

  it("answers an aggregate over a qualified name", async () => {
    // Given a strict engine over the same table.
    const simulation = await aLinesSimulation(true);

    // When the sort aggregates the table's own column, named through the
    // table's alias.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, coalesce(sum(qty), 0) AS qty FROM rainlytics.lines AS l " +
        "GROUP BY sku ORDER BY sum(l.qty) DESC",
    );

    // Then it ran. A qualified name in ORDER BY resolves against the table,
    // and the output alias never comes into it.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["brolly", "9"],
      ["aerial", "3"],
    ]);
  });

  it("keeps the declaration written against one exact statement", async () => {
    // Given a strict engine and a declaration for the refused statement.
    const simulation = await aLinesSimulation(true);

    simulation.simAws
      .athena()
      .results()
      .onQuery(aggregateOverAlias, {
        columns: ["sku"],
        rows: [["written down"]],
      });

    // When that statement runs.
    const answered = await anAnsweredQuery(simulation, aggregateOverAlias);

    // Then the test's own statement about it wins, as it does over every other
    // reason the engine has for not answering a query.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["written down"]]);
  });
});

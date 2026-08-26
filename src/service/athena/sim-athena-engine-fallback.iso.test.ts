import {
  assertFalse,
  assertIdentical,
  assertObjectEquals,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";
import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";

const oneOrder = [{ id: 1, customer: "ada" }];

/** A simulation holding one order, with the engine left off. */
async function anOrderSimulation(
  serDe?: string,
): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "orders",
    columns: [
      { Name: "id", Type: "int" },
      { Name: "customer", Type: "string" },
    ],
    serDe,
  });

  await aSeededJson(simulation.simAws, "orders/part-0.json", oneOrder);

  return simulation;
}

describe("what answers an Athena query", () => {
  it("leaves the engine off until a test turns it on", async () => {
    // Given a simulation with data behind its table and nothing turned on.
    const simulation = await anOrderSimulation();

    simulation.simAws
      .athena()
      .results()
      .byDefault({ columns: ["id"], rows: [["declared"]] });

    // When a query runs.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders",
    );

    // Then the declaration answers it, as it did before an engine existed.
    assertFalse(simulation.simAws.athena().engine().isEnabled);
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("puts a declaration for one exact query ahead of the engine", async () => {
    // Given the engine on, and a declaration written against one statement.
    const simulation = await anOrderSimulation();
    const sql = "SELECT id FROM rainlytics.orders";

    await simulation.simAws.athena().engine().enable();
    simulation.simAws
      .athena()
      .results()
      .onQuery(sql, { columns: ["id"], rows: [["declared"]] });

    // When that statement runs, and when a statement nobody declared runs.
    const declared = await anAnsweredQuery(simulation, sql);
    const computed = await anAnsweredQuery(
      simulation,
      "SELECT customer FROM rainlytics.orders",
    );

    // Then the declaration wins its own statement and the engine takes the
    // rest. This is the escape hatch for a query the engine gets wrong.
    assertIdentical(declared.answeredBy, "declaration");
    assertObjectEquals(declared.rows, [["declared"]]);
    assertIdentical(computed.answeredBy, "engine");
    assertObjectEquals(computed.rows, [["ada"]]);
  });

  it("falls back where the parser turns the statement down", async () => {
    // Given the engine on, and a workgroup rule to fall back to.
    const simulation = await anOrderSimulation();

    await simulation.simAws.athena().engine().enable();
    simulation.simAws
      .athena()
      .results()
      .onWorkGroup(simulation.workGroup, {
        columns: ["id"],
        rows: [["declared"]],
      });

    // When a query the Athena grammar refuses runs.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders GROUP BY GROUPING SETS ((id))",
    );

    // Then the workgroup rule answers it rather than the query failing.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("falls back where the table declares a SerDe with no reader", async () => {
    // Given a Parquet table, with the engine on.
    const simulation = await anOrderSimulation(
      "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe",
    );

    await simulation.simAws.athena().engine().enable();
    simulation.simAws
      .athena()
      .results()
      .byDefault({ columns: ["id"], rows: [["declared"]] });

    // When a query against it runs.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders",
    );

    // Then the declaration answers it. Nothing here reads Parquet.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("falls back where SQLite refuses to run the statement", async () => {
    // Given the engine on and a table nothing seeded data for.
    const simulation = await anOrderSimulation();

    await simulation.simAws.athena().engine().enable();
    simulation.simAws
      .athena()
      .results()
      .byDefault({ columns: ["n"], rows: [["declared"]] });

    // When a query naming a column the table has not got runs.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT missing FROM rainlytics.orders",
    );

    // Then the declaration answers it. Simulated Athena has always accepted a
    // query real Athena would reject, and the engine keeps that promise.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("stops running queries once the engine is turned off again", async () => {
    // Given a simulation whose engine answered a query.
    const simulation = await anOrderSimulation();
    const sql = "SELECT customer FROM rainlytics.orders";

    await simulation.simAws.athena().engine().enable();
    simulation.simAws
      .athena()
      .results()
      .byDefault({ columns: ["customer"], rows: [["declared"]] });

    const computed = await anAnsweredQuery(simulation, sql);

    // When the engine is turned off and the same query runs again.
    simulation.simAws.athena().engine().disable();

    const answered = await anAnsweredQuery(simulation, sql);

    // Then the declaration takes it back.
    assertTrue(computed.answeredBy === "engine");
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("keeps the cutoff ahead of the engine", async () => {
    // Given a workgroup refusing a query that scans more than ten bytes.
    const simulation = await anOrderSimulation();

    await simulation.simAws.athena().engine().enable();
    await simulation.simAws.athena().updateWorkGroup({
      input: {
        WorkGroup: simulation.workGroup,
        ConfigurationUpdates: { BytesScannedCutoffPerQuery: 10 },
      },
    });

    // When a query over more than that runs.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders",
    );

    // Then it fails on the cutoff, which is checked before anything answers.
    assertIdentical(answered.state, "FAILED");
    assertUndefined(answered.answeredBy);
  });
});

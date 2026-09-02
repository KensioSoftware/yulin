import {
  assertFalse,
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import { SimAthena } from "./sim-athena.js";
import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  logsBucket,
  orcSerDe,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";

/** One order, so a table the engine can read has something under it. */
const oneOrder = [{ id: 1, customer: "ada" }];

/** The columns every orders table in this file declares. */
const orderColumns = [
  { Name: "id", Type: "int" },
  { Name: "customer", Type: "string" },
];

/**
 * A simulation over one orders table, with a default declaration behind it.
 *
 * The declaration is what a lenient engine falls back to, and what a strict one
 * refuses to fall back to. Every test here needs to tell the two apart.
 */
async function anOrdersSimulation(
  strict: boolean,
  serDe?: string,
): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "orders",
    columns: orderColumns,
    serDe,
  });

  await aSeededJson(simulation.simAws, "orders/part-0.json", oneOrder);

  simulation.simAws
    .athena()
    .results()
    .byDefault({ columns: ["id"], rows: [["declared"]] });

  await simulation.simAws.athena().engine().enable({ strict });

  return simulation;
}

describe("a strict Athena query engine", () => {
  it("is off until a test asks for it", async () => {
    // Given an engine turned on the way every test before this one turned it on.
    const simulation = await anEngineSimulation();

    await simulation.simAws.athena().engine().enable();

    // Then it answers from declarations where it cannot run a query, as it did
    // before strict mode existed.
    assertTrue(simulation.simAws.athena().engine().isEnabled);
    assertFalse(simulation.simAws.athena().engine().isStrict);
  });

  it("fails a statement the grammar refuses", async () => {
    // Given a strict engine.
    const simulation = await anOrdersSimulation(true);

    // When a query the Athena grammar refuses runs.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders GROUP BY GROUPING SETS ((id))",
    );

    // Then it failed rather than answering from the default declaration.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason ?? "", "cannot run this statement");
    assertStringIncludes(answered.reason ?? "", "results()");
  });

  it("fails a table in a format it has no reader for", async () => {
    // Given a strict engine and an ORC table.
    const simulation = await anOrdersSimulation(true, orcSerDe);

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders",
    );

    // Then the reason names the SerDe and the table that declares it.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason ?? "", orcSerDe);
    assertStringIncludes(answered.reason ?? "", "rainlytics.orders");
  });

  it("fails a table declaring no SerDe at all", async () => {
    // Given a strict engine and a table saying nothing about its objects.
    const simulation = await anEngineSimulation();

    // Declared here rather than through the fixture, which always writes a
    // SerdeInfo, because a table without one is the whole of this case.
    simulation.simAws.glue().createTable({
      input: {
        DatabaseName: "rainlytics",
        TableInput: {
          Name: "orders",
          StorageDescriptor: {
            Columns: orderColumns,
            Location: `s3://${logsBucket}/orders/`,
          },
        },
      },
    });

    await simulation.simAws.athena().engine().enable({ strict: true });

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders",
    );

    // Then the reason says the table declares nothing to read it by.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason ?? "", "declares no SerDe");
  });

  it("fails a statement SQLite will not run", async () => {
    // Given a strict engine.
    const simulation = await anOrdersSimulation(true);

    // When a query names a column the table has not got.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT missing FROM rainlytics.orders",
    );

    // Then the reason carries what stopped it, rather than the query passing
    // on rows the default declaration held.
    assertIdentical(answered.state, "FAILED");
    assertStringIncludes(answered.reason ?? "", "could not answer");
  });

  it("answers a query it can run", async () => {
    // Given a strict engine over a table it reads.
    const simulation = await anOrdersSimulation(true);

    // When a query it can run runs.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT customer FROM rainlytics.orders",
    );

    // Then strict mode changed nothing about it.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["ada"]]);
  });

  it("fails where nothing in scope holds the objects", async () => {
    // Given simulated Athena built on its own, which has no simulated S3.
    const athena = new SimAthena();

    await athena.createWorkGroup({
      input: {
        Name: "standalone",
        Configuration: {
          ResultConfiguration: { OutputLocation: "s3://results/q/" },
        },
      },
    });
    athena.results().byDefault({ columns: ["n"], rows: [["declared"]] });

    await athena.engine().enable({ strict: true });

    // When a query runs.
    const started = await athena.startQueryExecution({
      input: { QueryString: "SELECT 1 AS n", WorkGroup: "standalone" },
    });

    // The runner schedules the query to start, and then to finish, so a
    // standalone Athena with no SimAws to settle needs both turns of the loop.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const execution = athena
      .queryExecutions()
      .find((one) => one.queryExecutionId === started.QueryExecutionId);

    // Then the reason says there was nowhere to read from, rather than the
    // query passing on the rows a default declaration held.
    assertIdentical(execution?.state, "FAILED");
    assertStringIncludes(execution.stateChangeReason ?? "", "no simulated S3");
  });

  it("keeps the declaration written against one exact statement", async () => {
    // Given a strict engine and a declaration for a statement it cannot run.
    const simulation = await anOrdersSimulation(true);
    const sql =
      "SELECT id FROM rainlytics.orders GROUP BY GROUPING SETS ((id))";

    simulation.simAws
      .athena()
      .results()
      .onQuery(sql, { columns: ["id"], rows: [["written down"]] });

    // When that statement runs.
    const answered = await anAnsweredQuery(simulation, sql);

    // Then the test's own statement about it still wins, since a strict engine
    // is about queries nobody said anything about.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["written down"]]);
  });

  it("leaves a lenient engine falling back", async () => {
    // Given an engine turned on without strict mode.
    const simulation = await anOrdersSimulation(false);

    // When a query it cannot run runs.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders GROUP BY GROUPING SETS ((id))",
    );

    // Then the default declaration answers it, as it always has.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("turns nothing down once the engine is off again", async () => {
    // Given a strict engine that is then turned off.
    const simulation = await anOrdersSimulation(true);

    simulation.simAws.athena().engine().disable();

    // When a query the engine could never have run runs.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders GROUP BY GROUPING SETS ((id))",
    );

    // Then the declaration takes it back, and strictness went with the engine.
    assertFalse(simulation.simAws.athena().engine().isStrict);
    assertIdentical(answered.state, "SUCCEEDED");
    assertObjectEquals(answered.rows, [["declared"]]);
  });
});

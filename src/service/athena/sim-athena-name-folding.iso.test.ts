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
} from "./sim-athena-engine.fixture.js";
import { aRanQuery } from "./sim-athena-ran-query.fixture.js";

describe("folding the names an Athena query holds", () => {
  it("resolves a table named in mixed case", async () => {
    // Given a table in the catalog, holding one row.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "stock",
      columns: [{ Name: "sku", Type: "string" }],
    });

    await aSeededJson(simulation.simAws, "stock/part-0.json", [
      { sku: "bolt" },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When a query names it with capitals in both parts.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku FROM Rainlytics.Stock",
    );

    // Then it resolves. Athena accepts mixed case in a query and lower cases
    // the names when it executes it.
    assertObjectEquals(answered.rows, [["bolt"]]);
  });

  it("folds a quoted identifier too", async () => {
    // Given the same table.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "stock",
      columns: [{ Name: "sku", Type: "string" }],
    });

    await aSeededJson(simulation.simAws, "stock/part-0.json", [
      { sku: "bolt" },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When the query quotes the names and writes them in mixed case.
    const answered = await anAnsweredQuery(
      simulation,
      'SELECT sku FROM "rainlytics"."Stock"',
    );

    // Then quoting does not hold the case. Real Athena folds a quoted
    // identifier when it executes the query as well.
    assertObjectEquals(answered.rows, [["bolt"]]);
  });

  it("resolves against a mixed case database in the query context", async () => {
    // Given the same table, queried without qualifying it.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "stock",
      columns: [{ Name: "sku", Type: "string" }],
    });

    await aSeededJson(simulation.simAws, "stock/part-0.json", [
      { sku: "bolt" },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When the execution's own database carries capitals.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku FROM Stock",
      "Rainlytics",
    );

    // Then it resolves the same way.
    assertObjectEquals(answered.rows, [["bolt"]]);
  });

  it("names the folded table where one is absent", async () => {
    // Given a catalog holding a database and no such table.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "stock",
      columns: [{ Name: "sku", Type: "string" }],
    });

    // When a query names a table nobody made, in mixed case.
    const ran = await aRanQuery(
      simulation.simAws,
      simulation.workGroup,
      "SELECT * FROM Rainlytics.Missing_Table",
    );

    // Then it fails, naming the table the way Athena went looking for it.
    assertIdentical(ran.state, "FAILED");
    assertStringIncludes(
      ran.reason ?? "",
      "awsdatacatalog.rainlytics.missing_table",
    );
  });
});

import { assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import {
  anEngineSimulation,
  aSeededJson,
  logsBucket,
} from "./sim-athena-engine.fixture.js";
import {
  aStockPartition,
  aStockTable,
} from "./sim-athena-registered-partition.fixture.js";

describe("querying a table whose partitions are registered", () => {
  it("reads a partition from the location it was registered with", async () => {
    // Given a table partitioned by day, with one day registered under a
    // prefix nothing about the table's own location would find.
    const simulation = await anEngineSimulation();

    aStockTable(simulation);
    aStockPartition(
      simulation,
      ["2026-08-01"],
      `s3://${logsBucket}/archived/august/`,
    );

    await aSeededJson(simulation.simAws, "archived/august/part-0.json", [
      { sku: "bolt" },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When a query reads the table.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, day FROM rainlytics.stock",
    );

    // Then the row comes back with the day it was registered under. Nothing
    // in the object or its key says which partition it belongs to, so the
    // registration is the only thing that knows.
    assertObjectEquals(answered.rows, [["bolt", "2026-08-01"]]);
  });

  it("reads only the partitions the query's filter allows", async () => {
    // Given two days registered, each holding one row.
    const simulation = await anEngineSimulation();

    aStockTable(simulation);

    const days = ["2026-08-01", "2026-08-02"];

    for (const day of days) {
      aStockPartition(simulation, [day], `s3://${logsBucket}/${day}/`);
    }

    await Promise.all(
      days.map(async (day) =>
        aSeededJson(simulation.simAws, `${day}/part-0.json`, [
          { sku: `sold-${day}` },
        ]),
      ),
    );
    await simulation.simAws.athena().engine().enable();

    // When a query pins one of them.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku FROM rainlytics.stock WHERE day = '2026-08-02'",
    );

    // Then only that day's rows are read.
    assertObjectEquals(answered.rows, [["sold-2026-08-02"]]);
  });

  it("reads a partition registered without a location of its own", async () => {
    // Given a day registered with nothing said about where it sits.
    const simulation = await anEngineSimulation();

    aStockTable(simulation);
    aStockPartition(simulation, ["2026-08-01"]);

    await aSeededJson(simulation.simAws, "stock/day=2026-08-01/part-0.json", [
      { sku: "bolt" },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When a query reads the table.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, day FROM rainlytics.stock",
    );

    // Then it is found under the Hive layout beneath the table's location,
    // which is where Athena looks for one.
    assertObjectEquals(answered.rows, [["bolt", "2026-08-01"]]);
  });

  it("reads the projection where a table carries both", async () => {
    // Given a table projecting one day, with another day registered against
    // it holding rows of its own.
    const simulation = await anEngineSimulation();

    aStockTable(simulation, {
      "projection.enabled": "true",
      "projection.day.type": "date",
      "projection.day.format": "yyyy-MM-dd",
      "projection.day.range": "2026-08-01,2026-08-01",
    });
    aStockPartition(
      simulation,
      ["2026-08-02"],
      `s3://${logsBucket}/registered/`,
    );

    await aSeededJson(simulation.simAws, "stock/day=2026-08-01/part-0.json", [
      { sku: "projected" },
    ]);
    await aSeededJson(simulation.simAws, "registered/part-0.json", [
      { sku: "registered" },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When a query reads the table.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku FROM rainlytics.stock",
    );

    // Then the projected partition is the whole of it. Real Athena stops
    // reading the catalog's partitions once projection is on.
    assertObjectEquals(answered.rows, [["projected"]]);
  });
});

import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  logsBucket,
} from "./sim-athena-engine.fixture.js";
import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";

describe("the schema an Athena query runs against", () => {
  it("takes a column's case from Glue rather than from the data", async () => {
    // Given a table whose column names are lower case and objects whose keys
    // are not.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "readings",
      columns: [{ Name: "site", Type: "string" }],
    });

    await aSeededJson(simulation.simAws, "readings/part-0.json", [
      { Site: "alpha" },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When a query reads the column.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT site FROM rainlytics.readings",
    );

    // Then it reads, because Hive column names are matched without regard to
    // case and the JSON behind a table need not agree with the catalog.
    assertObjectEquals(answered.rows, [["alpha"]]);
  });

  it("keeps a nested value as the JSON text a function can reach into", async () => {
    // Given a column holding an object and one holding an array.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "events",
      columns: [
        { Name: "detail", Type: "struct<tenant:string>" },
        { Name: "tags", Type: "array<string>" },
        { Name: "cost", Type: "decimal(10,2)" },
      ],
    });

    await aSeededJson(simulation.simAws, "events/part-0.json", [
      { detail: { tenant: "acme" }, tags: ["a", "b"], cost: 1.5 },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When a query reaches into each of them.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT json_extract_scalar(detail, '$.tenant') AS tenant, " +
        "cardinality(tags) AS tag_count, cost FROM rainlytics.events",
    );

    // Then the structured columns read, and the decimal keeps its fraction.
    assertObjectEquals(answered.rows, [["acme", "2", "1.5"]]);
    assertObjectEquals(answered.columns, ["varchar", "bigint", "decimal"]);
  });

  it("drops a partition key repeating the name of a column", async () => {
    // Given a table whose partition key is also one of its columns, which is
    // a table real Athena refuses to query.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "stock",
      columns: [
        { Name: "sku", Type: "string" },
        { Name: "day", Type: "string" },
      ],
      partitionKeys: [{ Name: "day", Type: "string" }],
    });

    await aSeededJson(simulation.simAws, "stock/day=2026-08-01/part-0.json", [
      { sku: "bolt", day: "2026-08-01" },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When a query reads both columns.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, day FROM rainlytics.stock",
    );

    // Then the duplicate is dropped rather than the query failing on a table
    // SQLite would refuse to create.
    assertObjectEquals(answered.rows, [["bolt", "2026-08-01"]]);
  });

  it("falls back where the table declares no columns", async () => {
    // Given a table nobody gave a schema to.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, { name: "empty", columns: [] });

    await aSeededJson(simulation.simAws, "empty/part-0.json", [{ a: 1 }]);
    await simulation.simAws.athena().engine().enable();
    simulation.simAws
      .athena()
      .results()
      .byDefault({ columns: ["seen"], rows: [["declared"]] });

    // When a query counts its rows.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT count(*) AS seen FROM rainlytics.empty",
    );

    // Then the declaration answers it. Neither SQLite nor Athena has a table
    // without columns, so there is nothing for the engine to read.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("falls back where the table declares no SerDe at all", async () => {
    // Given a table that never said what its objects hold.
    const simulation = await anEngineSimulation();

    simulation.simAws.glue().createTable({
      input: {
        DatabaseName: "rainlytics",
        TableInput: {
          Name: "unsaid",
          StorageDescriptor: {
            Columns: [{ Name: "sku", Type: "string" }],
            Location: `s3://${logsBucket}/unsaid/`,
          },
        },
      },
    });

    await aSeededJson(simulation.simAws, "unsaid/part-0.json", [
      { sku: "bolt" },
    ]);
    await simulation.simAws.athena().engine().enable();
    simulation.simAws
      .athena()
      .results()
      .byDefault({ columns: ["sku"], rows: [["declared"]] });

    // When a query runs against it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku FROM rainlytics.unsaid",
    );

    // Then the declaration answers it. Guessing would answer a Parquet query
    // with nonsense rather than turning it down.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("reads a partition value written into the key path percent encoded", async () => {
    // Given a partition value carrying a space.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "stock",
      columns: [{ Name: "sku", Type: "string" }],
      partitionKeys: [{ Name: "site", Type: "string" }],
    });

    await aSeededJson(simulation.simAws, "stock/site=north%20yard/a.json", [
      { sku: "bolt" },
    ]);
    await aSeededJson(simulation.simAws, "stock/site=%zz/b.json", [
      { sku: "nut" },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When a query reads the partition column.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT site FROM rainlytics.stock ORDER BY sku",
    );

    // Then the encoding comes off, and a value that is no encoding at all is
    // left as it was written.
    assertObjectEquals(answered.rows, [["north yard"], ["%zz"]]);
  });
});

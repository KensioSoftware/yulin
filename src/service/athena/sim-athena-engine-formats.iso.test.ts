import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  aSeededObject,
  csvSerDe,
  logsBucket,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";
import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";

const stockColumns = [
  { Name: "sku", Type: "string" },
  { Name: "held", Type: "int" },
];

/** A table projecting one prefix per day across two days. */
const projectedDays = {
  "projection.enabled": "true",
  "projection.day.type": "date",
  "projection.day.format": "yyyy-MM-dd",
  "projection.day.range": "2026-08-01,2026-08-02",
};

async function aStockSimulation(
  table: Partial<Parameters<typeof aCatalogTable>[1]> = {},
): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "stock",
    columns: stockColumns,
    ...table,
  });

  await simulation.simAws.athena().engine().enable();

  return simulation;
}

describe("the objects an Athena query reads", () => {
  it("reads quoted CSV, skipping the header the table declares", async () => {
    // Given a CSV table whose first line names its columns.
    const simulation = await aStockSimulation({
      serDe: csvSerDe,
      parameters: { "skip.header.line.count": "1" },
    });

    await aSeededObject(
      simulation.simAws,
      "stock/all.csv",
      'sku,held\n"widget, large",4\nbolt,9\n',
    );

    // When a query rolls the file up.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, held FROM rainlytics.stock ORDER BY held DESC",
    );

    // Then the header is not a row, and the comma inside the quoted field is
    // part of the value rather than a column boundary.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["bolt", "9"],
      ["widget, large", "4"],
    ]);
  });

  it("takes the delimiter the table declares", async () => {
    // Given a table declaring a pipe as its separator.
    const simulation = await aStockSimulation({
      serDe: csvSerDe,
      serDeParameters: { separatorChar: "|" },
    });

    await aSeededObject(simulation.simAws, "stock/all.psv", "bolt|9\n");

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, held FROM rainlytics.stock",
    );

    // Then the fields split on the pipe.
    assertObjectEquals(answered.rows, [["bolt", "9"]]);
  });

  it("reads an empty CSV field as a null", async () => {
    // Given a row whose count was left blank.
    const simulation = await aStockSimulation({ serDe: csvSerDe });

    await aSeededObject(simulation.simAws, "stock/all.csv", "bolt,\n");

    // When a query asks whether it is null.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku FROM rainlytics.stock WHERE held IS NULL",
    );

    // Then it is. Delimited text cannot tell an empty string from an absent
    // value, and a numeric column is better served by the null.
    assertObjectEquals(answered.rows, [["bolt"]]);
  });

  it("reads a partition column out of the key path", async () => {
    // Given a table laid out Hive style under its own location.
    const simulation = await aStockSimulation({
      partitionKeys: [{ Name: "day", Type: "string" }],
    });

    await aSeededJson(simulation.simAws, "stock/day=2026-08-01/part-0.json", [
      { sku: "bolt", held: 9 },
    ]);
    await aSeededJson(simulation.simAws, "stock/day=2026-08-02/part-0.json", [
      { sku: "bolt", held: 4 },
    ]);

    // When a query groups on the partition column.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT day, sum(held) AS held FROM rainlytics.stock GROUP BY day ORDER BY day",
    );

    // Then the column reads, though no object holds it.
    assertObjectEquals(answered.rows, [
      ["2026-08-01", "9"],
      ["2026-08-02", "4"],
    ]);
  });

  it("reads a partition column a location template hides", async () => {
    // Given a projected table whose prefixes carry no `key=value` segment.
    const simulation = await aStockSimulation({
      partitionKeys: [{ Name: "day", Type: "string" }],
      parameters: {
        ...projectedDays,
        "storage.location.template": `s3://${logsBucket}/stock/\${day}/`,
      },
    });

    await aSeededJson(simulation.simAws, "stock/2026-08-01/part-0.json", [
      { sku: "bolt", held: 9 },
    ]);
    await aSeededJson(simulation.simAws, "stock/2026-08-02/part-0.json", [
      { sku: "bolt", held: 4 },
    ]);

    // When a query filters on that column.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sum(held) AS held FROM rainlytics.stock WHERE day = '2026-08-02'",
    );

    // Then the projection is what says which partition a row belongs to. The
    // key path could not, and the filter would answer nothing without it.
    assertObjectEquals(answered.rows, [["4"]]);
  });

  it("reads an object one query names two partitions of once", async () => {
    // Given a table whose tenant is injected, so the query supplies the
    // partition values itself.
    const simulation = await aStockSimulation({
      partitionKeys: [{ Name: "tenant", Type: "string" }],
      parameters: {
        "projection.enabled": "true",
        "projection.tenant.type": "injected",
        "storage.location.template": `s3://${logsBucket}/stock/\${tenant}/`,
      },
    });

    await aSeededJson(simulation.simAws, "stock/acme/part-0.json", [
      { sku: "bolt", held: 9 },
    ]);

    // When a query names the same partition twice.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT count(*) AS seen FROM rainlytics.stock " +
        "WHERE tenant IN ('acme', 'acme')",
    );

    // Then the object behind it is read once rather than twice.
    assertObjectEquals(answered.rows, [["1"]]);
  });

  it("takes an escaped quote inside a quoted field", async () => {
    // Given a CSV file whose quoted field carries a quote of its own, written
    // both ways OpenCSVSerde takes it, and no newline at the end.
    const simulation = await aStockSimulation({ serDe: csvSerDe });

    await aSeededObject(
      simulation.simAws,
      "stock/all.csv",
      `${String.raw`"5\" bolt",9`}\n"6"" bolt",4`,
    );

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku FROM rainlytics.stock ORDER BY sku",
    );

    // Then both quotes are part of the value, and the last line is a row
    // though nothing closed it.
    assertObjectEquals(answered.rows, [['5" bolt'], ['6" bolt']]);
  });

  it("reads a file whose delimiter is quoted along with its fields", async () => {
    // Given a quoted field carrying the delimiter and a line ending.
    const simulation = await aStockSimulation({ serDe: csvSerDe });

    await aSeededObject(
      simulation.simAws,
      "stock/all.csv",
      '"bolt\r\nlong",9\r\n',
    );

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, held FROM rainlytics.stock",
    );

    // Then the field survives whole, and the carriage return outside it does
    // not become part of a value.
    assertObjectEquals(answered.rows, [["bolt\r\nlong", "9"]]);
  });

  it("reads a boolean written as a word in delimited text", async () => {
    // Given a CSV table with a boolean column.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "stock",
      columns: [
        { Name: "sku", Type: "string" },
        { Name: "listed", Type: "boolean" },
      ],
      serDe: csvSerDe,
    });

    await aSeededObject(
      simulation.simAws,
      "stock/all.csv",
      "bolt,TRUE\nnut,false\nwasher,maybe\n",
    );
    await simulation.simAws.athena().engine().enable();

    // When a query filters on it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT sku, listed FROM rainlytics.stock WHERE listed = true",
    );

    // Then the word compares as a boolean and reads back as one. Anything
    // that is no boolean at all reads as null and matches neither.
    assertObjectEquals(answered.rows, [["bolt", "true"]]);
  });
});

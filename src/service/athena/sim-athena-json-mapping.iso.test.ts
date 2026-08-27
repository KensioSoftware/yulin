import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";

/** The SerDe class name a Hive JSON table declares. */
const hiveJsonSerDe = "org.apache.hive.hcatalog.data.JsonSerDe";

/** What a CloudFront access log table can name its columns. */
const logColumns = [
  { Name: "timestamp_ms", Type: "string" },
  { Name: "cs_uri_stem", Type: "string" },
  { Name: "cs_referer", Type: "string" },
  { Name: "c_country", Type: "string" },
];

/** One access log record, keyed the way CloudFront delivers it. */
const logRecord = {
  "timestamp(ms)": "1787793822795",
  "cs-uri-stem": "/",
  "cs(Referer)": "https://rainlytics.example/",
  c_country: "GB",
};

/** The mappings those columns are reached through. */
const logMappings = {
  "mapping.timestamp_ms": "timestamp(ms)",
  "mapping.cs_uri_stem": "cs-uri-stem",
  "mapping.cs_referer": "cs(Referer)",
  "mapping.c_country": "c_country",
};

async function aLogsSimulation(
  serDeParameters: Record<string, string>,
  serDe?: string,
): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "cloudfront_logs",
    columns: logColumns,
    serDe,
    serDeParameters,
  });

  await simulation.simAws.athena().engine().enable();

  return simulation;
}

describe("the JSON keys an Athena column is mapped to", () => {
  it("reads a column through the key the SerDe maps it to", async () => {
    // Given a table over CloudFront's own field names, which carry brackets
    // and hyphens no Athena column name can.
    const simulation = await aLogsSimulation({
      "case.insensitive": "FALSE",
      ...logMappings,
    });

    await aSeededJson(simulation.simAws, "cloudfront_logs/part-0.json", [
      logRecord,
    ]);

    // When a query selects the mapped columns.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT timestamp_ms, cs_uri_stem, cs_referer, c_country " +
        'FROM "rainlytics"."cloudfront_logs"',
    );

    // Then every one of them reads, the mapped ones along with the column
    // whose mapping names the key it already had.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["1787793822795", "/", "https://rainlytics.example/", "GB"],
    ]);
  });

  it("matches a mapped key of any case where the table stays case insensitive", async () => {
    // Given a table declaring no `case.insensitive`, and a record whose key is
    // written in another case than the mapping.
    const simulation = await aLogsSimulation(logMappings);

    await aSeededJson(simulation.simAws, "cloudfront_logs/part-0.json", [
      { "CS(REFERER)": "https://rainlytics.example/pricing" },
    ]);

    // When a query selects the mapped column.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT cs_referer FROM rainlytics.cloudfront_logs " +
        "WHERE cs_referer LIKE '%pricing'",
    );

    // Then the key matches, since the SerDe folds a record's keys before it
    // looks one up unless a table turns that off.
    assertObjectEquals(answered.rows, [["https://rainlytics.example/pricing"]]);
  });

  it("matches a mapped key as written where the table is case sensitive", async () => {
    // Given a case sensitive table, and a record holding the mapped key in
    // another case than the mapping names.
    const simulation = await aLogsSimulation({
      "case.insensitive": "FALSE",
      ...logMappings,
    });

    await aSeededJson(simulation.simAws, "cloudfront_logs/part-0.json", [
      { c_country: "GB", "cs(referer)": "https://rainlytics.example/" },
    ]);

    // When a query asks whether the column is null.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT c_country FROM rainlytics.cloudfront_logs " +
        "WHERE cs_referer IS NULL",
    );

    // Then it is. `case.insensitive` off is what a table declares to keep the
    // keys apart, and the mapping is matched as it was written.
    assertObjectEquals(answered.rows, [["GB"]]);
  });

  it("reads a mapped column from its key rather than from its own name", async () => {
    // Given a column mapped to a key the record does not carry, while the
    // record does carry a key of the column's own name.
    const simulation = await aLogsSimulation({
      "mapping.cs_referer": "cs(Referer)",
    });

    await aSeededJson(simulation.simAws, "cloudfront_logs/part-0.json", [
      { c_country: "GB", cs_referer: "https://rainlytics.example/" },
    ]);

    // When a query asks whether the mapped column is null.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT c_country FROM rainlytics.cloudfront_logs " +
        "WHERE cs_referer IS NULL",
    );

    // Then it is. The mapping is where that column reads from, and a key of
    // the column's own name is not it.
    assertObjectEquals(answered.rows, [["GB"]]);
  });

  it("leaves a Hive JSON SerDe reading by column name", async () => {
    // Given the same mappings against the Hive JSON SerDe, which has no
    // `mapping` property of its own.
    const simulation = await aLogsSimulation(logMappings, hiveJsonSerDe);

    await aSeededJson(simulation.simAws, "cloudfront_logs/part-0.json", [
      { ...logRecord, cs_referer: "https://rainlytics.example/pricing" },
    ]);

    // When a query selects the column both the mapping and the record name.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT cs_referer FROM rainlytics.cloudfront_logs",
    );

    // Then the record's own key is what it reads, the way real Athena reads
    // that table.
    assertObjectEquals(answered.rows, [["https://rainlytics.example/pricing"]]);
  });
});

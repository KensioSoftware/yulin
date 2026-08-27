import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { deflateSync, gzipSync, zstdCompressSync } from "node:zlib";
import { describe, it } from "vitest";

import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import {
  aCatalogTable,
  anEngineSimulation,
  aSeededBytes,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";

/** The prefix a delivered object sits under, partitioned by the hour. */
const logsPrefix = "cloudfront_logs/year=2026/month=08/day=27/hour=01";

/** One JSON record, as CloudFront standard logging writes it. */
const logLines = '{"c_country":"GB","sc_status":200}\n';

/** A simulation over a CloudFront log table, with the engine on. */
async function aLogsSimulation(): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "cloudfront_logs",
    columns: [
      { Name: "c_country", Type: "string" },
      { Name: "sc_status", Type: "int" },
    ],
  });

  simulation.simAws
    .athena()
    .results()
    .byDefault({ columns: ["c_country"], rows: [["declared"]] });

  await simulation.simAws.athena().engine().enable();

  return simulation;
}

describe("the compression an Athena query reads through", () => {
  it("reads a gzipped object", async () => {
    // Given a delivered object, gzipped under a key ending `.gz` the way
    // CloudFront standard logging writes one.
    const simulation = await aLogsSimulation();

    await aSeededBytes(
      simulation.simAws,
      `${logsPrefix}/E1EXAMPLE1234.2026-08-27-01.f63cf97b.gz`,
      gzipSync(logLines),
    );

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT c_country FROM rainlytics.cloudfront_logs",
    );

    // Then the record behind the compression is what answers.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["GB"]]);
  });

  it("reads a zstd object", async () => {
    // Given an object compressed with zstd.
    const simulation = await aLogsSimulation();

    await aSeededBytes(
      simulation.simAws,
      `${logsPrefix}/part-0.zst`,
      zstdCompressSync(logLines),
    );

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT c_country FROM rainlytics.cloudfront_logs",
    );

    // Then the extension is what says which codec opened it.
    assertObjectEquals(answered.rows, [["GB"]]);
  });

  it("reads a deflated object", async () => {
    // Given an object compressed with deflate.
    const simulation = await aLogsSimulation();

    await aSeededBytes(
      simulation.simAws,
      `${logsPrefix}/part-0.deflate`,
      deflateSync(logLines),
    );

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT c_country FROM rainlytics.cloudfront_logs",
    );

    // Then it reads, the same as the other two Node decompresses.
    assertObjectEquals(answered.rows, [["GB"]]);
  });

  it("turns a query down where the key names a codec it cannot read", async () => {
    // Given an object under a key ending `.bz2`, which nothing here opens.
    const simulation = await aLogsSimulation();

    await aSeededBytes(
      simulation.simAws,
      `${logsPrefix}/part-0.bz2`,
      Buffer.from(logLines),
    );

    // When a query reads the table.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT c_country FROM rainlytics.cloudfront_logs",
    );

    // Then the declaration answers it. An unread codec would otherwise look
    // like an object holding no rows, and the declaration would never get its
    // turn.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("turns a query down where a compressed object does not decompress", async () => {
    // Given an object whose key ends `.gz` and whose bytes are plain text.
    const simulation = await aLogsSimulation();

    await aSeededBytes(
      simulation.simAws,
      `${logsPrefix}/part-0.gz`,
      Buffer.from(logLines),
    );

    // When a query reads the table.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT c_country FROM rainlytics.cloudfront_logs",
    );

    // Then the declaration answers it. Athena reads the extension rather than
    // the bytes, and an object that fails to open is one the engine has no
    // rows for.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("reads an uncompressed object under a key holding no extension", async () => {
    // Given an object whose key ends in no extension at all.
    const simulation = await aLogsSimulation();

    await aSeededBytes(
      simulation.simAws,
      `${logsPrefix}/part-0`,
      Buffer.from(logLines),
    );

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT c_country FROM rainlytics.cloudfront_logs",
    );

    // Then it reads as text.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["GB"]]);
  });
});

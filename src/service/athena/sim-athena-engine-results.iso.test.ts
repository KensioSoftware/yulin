import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";
import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";

const readings = [
  { site: "Alpha", live: true, celsius: 20.5, samples: 4 },
  { site: "alpha", live: false, celsius: 18, samples: 7 },
  { site: null, live: true, celsius: 19.25, samples: 2 },
];

/** A simulation holding the readings, with the engine on. */
async function aReadingSimulation(): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "readings",
    columns: [
      { Name: "site", Type: "string" },
      { Name: "live", Type: "boolean" },
      { Name: "celsius", Type: "double" },
      { Name: "samples", Type: "int" },
    ],
  });

  await aSeededJson(simulation.simAws, "readings/part-0.json", readings);
  await simulation.simAws.athena().engine().enable();

  return simulation;
}

describe("what a query the engine ran answers with", () => {
  it("reports Athena's own type names from the Glue schema", async () => {
    // Given a table declaring four Hive types.
    const simulation = await aReadingSimulation();

    // When a query selects each of them.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT site, live, celsius, samples FROM rainlytics.readings LIMIT 1",
    );

    // Then the metadata is written the way Athena writes it, so `string` is
    // reported as `varchar` and `int` as `integer`.
    assertObjectEquals(answered.columns, [
      "varchar",
      "boolean",
      "double",
      "integer",
    ]);
  });

  it("renders a boolean column as true and false", async () => {
    // Given the readings, whose `live` column is a Glue boolean.
    const simulation = await aReadingSimulation();

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT live FROM rainlytics.readings ORDER BY samples",
    );

    // Then it reads as Athena writes it rather than as the 1 and 0 SQLite
    // holds, because the Glue column type says which columns are boolean.
    assertObjectEquals(answered.rows, [["true"], ["true"], ["false"]]);
  });

  it("orders nulls last ascending, as Trino does", async () => {
    // Given a reading whose site is null.
    const simulation = await aReadingSimulation();

    // When a query sorts on that column ascending.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT site FROM rainlytics.readings ORDER BY site",
    );

    // Then the null sorts last. SQLite sorts it first, and a test whose
    // expected order came from production would fail on that difference.
    assertObjectEquals(answered.rows, [["Alpha"], ["alpha"], [""]]);
  });

  it("orders nulls last inside a window with a frame", async () => {
    // Given a reading whose site is null.
    const simulation = await aReadingSimulation();

    // When a window function sorts on that column ascending and names a frame.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT site, sum(samples) OVER (ORDER BY site ASC " +
        "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running " +
        "FROM rainlytics.readings ORDER BY site",
    );

    // Then the null is last inside the window too. A frame follows the sort it
    // is framing, and an ascending sort has to carry NULLS LAST past it.
    assertObjectEquals(answered.rows, [
      ["Alpha", "4"],
      ["alpha", "11"],
      ["", "13"],
    ]);
  });

  it("matches LIKE with regard to case, as Athena does", async () => {
    // Given two sites differing only in case.
    const simulation = await aReadingSimulation();

    // When a query filters on one of them.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT count(*) AS matched FROM rainlytics.readings WHERE site LIKE 'alpha'",
    );

    // Then it matches the one. SQLite matches both by default, which is a
    // filter quietly taking in rows Athena excludes.
    assertObjectEquals(answered.rows, [["1"]]);
  });

  it("names an expression nobody named the way Athena names it", async () => {
    // Given the readings, with the engine on.
    const simulation = await aReadingSimulation();

    // When a query selects an aggregate with no alias on it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT count(*) FROM rainlytics.readings",
    );

    // Then the column is `_col0`, which is what Athena calls one.
    const results = await simulation.simAws.athena().getQueryResults({
      input: {
        QueryExecutionId: simulation.simAws.athena().queryExecutions().at(-1)
          ?.queryExecutionId,
      },
    });

    assertIdentical(answered.answeredBy, "engine");
    assertIdentical(
      results.ResultSet?.Rows?.[0]?.Data?.[0]?.VarCharValue,
      "_col0",
    );
  });

  it("writes the rows it computed to the workgroup's output location", async () => {
    // Given the readings, with the engine on.
    const simulation = await aReadingSimulation();

    // When a query runs.
    await anAnsweredQuery(
      simulation,
      "SELECT site FROM rainlytics.readings WHERE live = true ORDER BY site",
    );

    // Then the CSV under the output location holds what the engine computed,
    // rather than what any declaration said.
    const written = await simulation.simAws.s3().listObjectsV2({
      input: { Bucket: "rainlytics-results", Prefix: "q/" },
    });
    const object = await simulation.simAws.s3().getObject({
      input: {
        Bucket: "rainlytics-results",
        Key: written.Contents?.[0]?.Key ?? "",
      },
    });
    const body = Buffer.concat(await Array.fromAsync(object.Body ?? [])) as
      | Buffer
      | undefined;

    assertIdentical(body?.toString("utf8"), '"site"\n"Alpha"\n""\n');
  });

  it("infers a computed column's type from what it answered with", async () => {
    // Given the readings, with the engine on.
    const simulation = await aReadingSimulation();

    // When a query computes four columns the Glue schema says nothing about.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT max(site) AS latest, count(*) AS seen, " +
        "avg(celsius) AS mean, NULL AS nothing FROM rainlytics.readings",
    );

    // Then each type comes off the value, and a column of nulls falls back to
    // the type an undeclared column reports.
    assertObjectEquals(answered.columns, [
      "varchar",
      "bigint",
      "double",
      "varchar",
    ]);
  });

  it("takes the Trino spellings the parser will not read", async () => {
    // Given the readings, with the engine on.
    const simulation = await aReadingSimulation();

    // When a query casts the forgiving way and pages the Trino way round.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT try_cast(samples AS varchar) AS samples " +
        "FROM rainlytics.readings ORDER BY samples OFFSET 1 LIMIT 1",
    );

    // Then both are rewritten before the statement is parsed. Trino writes
    // OFFSET before LIMIT and every other dialect writes it after.
    assertObjectEquals(answered.rows, [["4"]]);
  });

  it("answers null for a column no object carried", async () => {
    // Given a table declaring a column the data has never held.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "readings",
      columns: [
        { Name: "site", Type: "string" },
        { Name: "humidity", Type: "double" },
      ],
    });

    await aSeededJson(simulation.simAws, "readings/part-0.json", [
      { site: "alpha" },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When a query asks for it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT site FROM rainlytics.readings WHERE humidity IS NULL",
    );

    // Then it reads as null rather than failing the query. A table declaring
    // more than its objects hold is ordinary.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["alpha"]]);
  });
});

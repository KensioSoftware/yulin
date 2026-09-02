import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";
import {
  aCatalogTable,
  anEngineSimulation,
  aSeededBytes,
  aSeededParquet,
  orcSerDe,
  parquetSerDe,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";

/** The columns every orders table in this file declares. */
const orderColumns = [
  { Name: "id", Type: "int" },
  { Name: "customer", Type: "string" },
  { Name: "total", Type: "bigint" },
  { Name: "paid", Type: "boolean" },
  { Name: "placed_at", Type: "timestamp" },
];

/** Those same columns, as one Parquet file holds them. */
const orderData = [
  { name: "id", data: [1, 2, 3], type: "INT32" as const },
  { name: "customer", data: ["ada", "grace", "ada"], type: "STRING" as const },
  { name: "total", data: [1200n, 90n, 305n], type: "INT64" as const },
  { name: "paid", data: [true, false, true], type: "BOOLEAN" as const },
  {
    name: "placed_at",
    data: [
      new Date("2026-08-01T10:00:00Z"),
      new Date("2026-08-02T09:00:00Z"),
      new Date("2026-08-03T11:30:00Z"),
    ],
    type: "TIMESTAMP" as const,
  },
];

/** A simulation over a Parquet orders table, with the engine on. */
async function anOrdersSimulation(
  serDe: string = parquetSerDe,
): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "orders",
    columns: orderColumns,
    serDe,
  });

  simulation.simAws
    .athena()
    .results()
    .byDefault({ columns: ["id"], rows: [["declared"]] });

  await simulation.simAws.athena().engine().enable();

  return simulation;
}

describe("an Athena query over a Parquet table", () => {
  it("answers from the file the table sits on", async () => {
    // Given a Parquet table holding three orders.
    const simulation = await anOrdersSimulation();

    await aSeededParquet(
      simulation.simAws,
      "orders/part-00000-c000.snappy.parquet",
      orderData,
    );

    // When a query groups them.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT customer, count(*) AS orders, sum(total) AS spent " +
        "FROM rainlytics.orders GROUP BY 1 ORDER BY spent DESC",
    );

    // Then the engine answered it from the objects.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["ada", "2", "1505"],
      ["grace", "1", "90"],
    ]);
  });

  it("reads a bigint past what a double holds exactly", async () => {
    // Given a Parquet table holding a total above 2^53.
    const simulation = await anOrdersSimulation();

    await aSeededParquet(simulation.simAws, "orders/part-0.parquet", [
      { name: "id", data: [1], type: "INT32" },
      { name: "total", data: [9_007_199_254_740_993n], type: "INT64" },
    ]);

    // When the total is read back.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT total FROM rainlytics.orders",
    );

    // Then every digit of it survived.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["9007199254740993"]]);
  });

  it("filters and reads back a timestamp column", async () => {
    // Given a Parquet table holding orders across three days.
    const simulation = await anOrdersSimulation();

    await aSeededParquet(simulation.simAws, "orders/part-0.parquet", orderData);

    // When a query filters on the instant each was placed.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id, placed_at FROM rainlytics.orders " +
        "WHERE placed_at >= timestamp '2026-08-02 00:00:00' ORDER BY id",
    );

    // Then the filter matched, and the instant reads as Athena writes one.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["2", "2026-08-02 09:00:00"],
      ["3", "2026-08-03 11:30:00"],
    ]);
  });

  it("reads a date column as a day with no time on it", async () => {
    // Given a table declaring one of its columns a date.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "orders",
      columns: [{ Name: "placed_on", Type: "date" }],
      serDe: parquetSerDe,
    });

    await simulation.simAws.athena().engine().enable();
    await aSeededParquet(simulation.simAws, "orders/part-0.parquet", [
      {
        name: "placed_on",
        data: [new Date("2026-08-01T00:00:00Z")],
        type: "TIMESTAMP",
      },
    ]);

    // When it is read back.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT placed_on FROM rainlytics.orders",
    );

    // Then the Glue column type is what dropped the time, as it does on Athena.
    assertObjectEquals(answered.rows, [["2026-08-01"]]);
  });

  it("reads a boolean column by what the file holds", async () => {
    // Given a Parquet table holding paid and unpaid orders.
    const simulation = await anOrdersSimulation();

    await aSeededParquet(simulation.simAws, "orders/part-0.parquet", orderData);

    // When the unpaid ones are asked for.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id, paid FROM rainlytics.orders WHERE paid = false",
    );

    // Then the boolean compared and read back as one.
    assertObjectEquals(answered.rows, [["2", "false"]]);
  });

  it("reads a nested column as the JSON the shims reach into", async () => {
    // Given a Parquet table with an array column.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "orders",
      columns: [
        { Name: "id", Type: "int" },
        { Name: "tags", Type: "array<string>" },
      ],
      serDe: parquetSerDe,
    });

    await simulation.simAws.athena().engine().enable();
    await aSeededParquet(simulation.simAws, "orders/part-0.parquet", [
      { name: "id", data: [1, 2], type: "INT32" },
      { name: "tags", data: [["gift", "rush"], ["gift"]] },
    ]);

    // When a query counts what each row's array holds.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id, cardinality(tags) AS n FROM rainlytics.orders ORDER BY id",
    );

    // Then the array reached the shim as its JSON.
    assertObjectEquals(answered.rows, [
      ["1", "2"],
      ["2", "1"],
    ]);
  });

  it("reads a column the table declares and the file has not got", async () => {
    // Given a table declaring a column no object was written with.
    const simulation = await anOrdersSimulation();

    await aSeededParquet(simulation.simAws, "orders/part-0.parquet", [
      { name: "id", data: [1], type: "INT32" },
    ]);

    // When that column is selected.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id, customer FROM rainlytics.orders",
    );

    // Then it reads as nothing, which is how Athena reads a column a file
    // written before it was added has not got.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["1", ""]]);
  });

  it("reads each partition of a table laid out Hive style", async () => {
    // Given a Parquet table partitioned by day.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "orders",
      columns: [{ Name: "id", Type: "int" }],
      partitionKeys: [{ Name: "day", Type: "string" }],
      serDe: parquetSerDe,
    });

    await simulation.simAws.athena().engine().enable();

    await Promise.all(
      (
        [
          ["2026-08-01", [1, 2]],
          ["2026-08-02", [3]],
        ] as const
      ).map(async ([day, ids]) =>
        aSeededParquet(simulation.simAws, `orders/day=${day}/part-0.parquet`, [
          { name: "id", data: [...ids], type: "INT32" },
        ]),
      ),
    );

    // When one day is asked for.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders WHERE day = '2026-08-01' ORDER BY id",
    );

    // Then the partition column came from the key path, as it does for JSON.
    assertObjectEquals(answered.rows, [["1"], ["2"]]);
  });
});

describe("what a Parquet table is compressed with", () => {
  it.each(["SNAPPY", "GZIP", "ZSTD", "BROTLI", "UNCOMPRESSED"] as const)(
    "reads a file written with %s",
    async (codec) => {
      // Given a Parquet table holding one file in this codec.
      const simulation = await anOrdersSimulation();

      await aSeededParquet(
        simulation.simAws,
        "orders/part-0.parquet",
        [{ name: "id", data: [7], type: "INT32" }],
        codec,
      );

      // When a query reads it.
      const answered = await anAnsweredQuery(
        simulation,
        "SELECT id FROM rainlytics.orders",
      );

      // Then the engine answered, since Node's own zlib covers all but snappy
      // and hyparquet covers that one itself.
      assertIdentical(answered.answeredBy, "engine");
      assertObjectEquals(answered.rows, [["7"]]);
    },
  );

  it("turns the query down for a codec nothing here decompresses", async () => {
    // Given a Parquet file written with LZ4, which would need a dependency.
    const simulation = await anOrdersSimulation();

    await aSeededParquet(
      simulation.simAws,
      "orders/part-0.parquet",
      [{ name: "id", data: [7], type: "INT32" }],
      "LZ4_RAW",
    );

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders",
    );

    // Then the declaration answers it, the way an unreadable object already
    // does.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });
});

describe("a Parquet object the engine cannot read", () => {
  it.each([
    ["holds something that is not Parquet", '{"id":1}\n'],
    ["is empty", ""],
  ])("falls back where the object %s", async (_case, body) => {
    // Given a Parquet table whose object the reader will refuse.
    const simulation = await anOrdersSimulation();

    await aSeededBytes(
      simulation.simAws,
      "orders/part-0.parquet",
      new TextEncoder().encode(body),
    );

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders",
    );

    // Then the declaration answers it rather than the query failing.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });

  it("leaves an ORC table to its declaration", async () => {
    // Given an ORC table, which nothing here reads.
    const simulation = await anOrdersSimulation(orcSerDe);

    await aSeededParquet(simulation.simAws, "orders/part-0.parquet", [
      { name: "id", data: [7], type: "INT32" },
    ]);

    // When a query reads it.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT id FROM rainlytics.orders",
    );

    // Then the declaration answers it.
    assertIdentical(answered.answeredBy, "declaration");
    assertObjectEquals(answered.rows, [["declared"]]);
  });
});

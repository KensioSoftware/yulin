/**
 * Where a Parquet table would answer differently from real Athena, or from the
 * text formats this engine already reads.
 */
import { parquetWriteBuffer } from "hyparquet-writer";

import { SimAws } from "../../src/index.js";

const parquet = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe";
const json = "org.openx.data.jsonserde.JsonSerDe";

async function simulation(
  serDe: string,
  columns: readonly { Name: string; Type: string }[],
): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.s3().createBucket({ input: { Bucket: "data" } });
  await simAws.s3().createBucket({ input: { Bucket: "results" } });
  await simAws.athena().createWorkGroup({
    input: {
      Name: "wg",
      Configuration: {
        ResultConfiguration: { OutputLocation: "s3://results/q/" },
      },
    },
  });

  await simAws.cloudFormation().deployTemplate({
    stackName: "s",
    template: {
      Resources: {
        Db: {
          Type: "AWS::Glue::Database",
          Properties: {
            CatalogId: { Ref: "AWS::AccountId" },
            DatabaseInput: { Name: "shop" },
          },
        },
        T: {
          Type: "AWS::Glue::Table",
          Properties: {
            CatalogId: { Ref: "AWS::AccountId" },
            DatabaseName: { Ref: "Db" },
            TableInput: {
              Name: "wide",
              TableType: "EXTERNAL_TABLE",
              StorageDescriptor: {
                Columns: columns,
                Location: "s3://data/wide/",
                SerdeInfo: { SerializationLibrary: serDe },
              },
            },
          },
        },
      },
    },
  });

  await simAws.athena().engine().enable();

  return simAws;
}

async function ask(
  simAws: SimAws,
  sql: string,
): Promise<{ rows: string[][]; scanned: number; by: string }> {
  const started = await simAws
    .athena()
    .startQueryExecution({ input: { QueryString: sql, WorkGroup: "wg" } });
  const id = started.QueryExecutionId ?? "";

  await simAws.backgroundTasksComplete();

  const described = await simAws
    .athena()
    .getQueryExecution({ input: { QueryExecutionId: id } });
  const results = await simAws
    .athena()
    .getQueryResults({ input: { QueryExecutionId: id } });
  const execution = simAws
    .athena()
    .queryExecutions()
    .find((one) => one.queryExecutionId === id);

  return {
    rows: (results.ResultSet?.Rows ?? []).map((row) =>
      (row.Data ?? []).map((cell) => cell.VarCharValue ?? "<null>"),
    ),
    scanned: described.QueryExecution?.Statistics?.DataScannedInBytes ?? 0,
    by: execution?.answeredBy ?? "?",
  };
}

console.log("=== 1. A columnar read is billed as the whole object ===");
{
  const wide = Array.from({ length: 20 }, (_, index) => ({
    Name: `c${String(index)}`,
    Type: "string",
  }));
  const simAws = await simulation(parquet, wide);
  const body = Buffer.from(
    parquetWriteBuffer({
      codec: "SNAPPY",
      columnData: wide.map((column) => ({
        name: column.Name,
        data: Array.from(
          { length: 500 },
          (_, row) => `${column.Name}-${String(row)}`,
        ),
        type: "STRING" as const,
      })),
    }),
  );

  await simAws
    .s3()
    .putObject({
      input: { Bucket: "data", Key: "wide/part-0.parquet", Body: body },
    });

  const all = await ask(simAws, "SELECT count(*) AS n FROM shop.wide");
  const one = await ask(
    simAws,
    "SELECT count(DISTINCT c0) AS n FROM shop.wide",
  );

  console.log(
    `  object                   ${String(body.byteLength)} bytes, 20 columns`,
  );
  console.log(
    `  count(*)                 ${String(all.scanned)} bytes scanned`,
  );
  console.log(
    `  one column of twenty     ${String(one.scanned)} bytes scanned`,
  );
  console.log("  real Athena bills the second one a fraction of the first.");
}

console.log("\n=== 2. Timestamp and date columns ===");
{
  const simAws = await simulation(parquet, [
    { Name: "at", Type: "timestamp" },
    { Name: "on_day", Type: "date" },
    { Name: "amount", Type: "decimal(10,2)" },
  ]);
  const body = Buffer.from(
    parquetWriteBuffer({
      codec: "SNAPPY",
      columnData: [
        {
          name: "at",
          data: [new Date("2026-08-01T10:00:00Z")],
          type: "TIMESTAMP",
        },
        {
          name: "on_day",
          data: [new Date("2026-08-01T00:00:00Z")],
          type: "TIMESTAMP",
        },
        { name: "amount", data: [12.34], type: "DOUBLE" },
      ],
    }),
  );

  await simAws
    .s3()
    .putObject({
      input: { Bucket: "data", Key: "wide/part-0.parquet", Body: body },
    });

  const got = await ask(simAws, "SELECT at, on_day, amount FROM shop.wide");
  console.log(`  answeredBy ${got.by}`);
  for (const row of got.rows) {
    console.log(`  | ${row.join(" | ")}`);
  }
  const filtered = await ask(
    simAws,
    "SELECT count(*) AS n FROM shop.wide WHERE at >= timestamp '2026-08-01 00:00:00'",
  );
  console.log(
    `  filter on a timestamp answers ${filtered.rows[1]?.[0] ?? "?"} (expected 1)`,
  );
}

console.log("\n=== 3. A nested column ===");
{
  const simAws = await simulation(parquet, [
    { Name: "id", Type: "int" },
    { Name: "tags", Type: "array<string>" },
  ]);
  const body = Buffer.from(
    parquetWriteBuffer({
      codec: "SNAPPY",
      columnData: [
        { name: "id", data: [1, 2], type: "INT32" },
        { name: "tags", data: [["a", "b"], ["c"]] },
      ],
    }),
  );

  await simAws
    .s3()
    .putObject({
      input: { Bucket: "data", Key: "wide/part-0.parquet", Body: body },
    });

  const got = await ask(
    simAws,
    "SELECT id, tags, cardinality(tags) AS n FROM shop.wide",
  );
  console.log(`  answeredBy ${got.by}`);
  for (const row of got.rows) {
    console.log(`  | ${row.join(" | ")}`);
  }
}

console.log("\n=== 4. A column the file has not got ===");
{
  const simAws = await simulation(parquet, [
    { Name: "id", Type: "int" },
    { Name: "added_later", Type: "string" },
  ]);
  const body = Buffer.from(
    parquetWriteBuffer({
      codec: "SNAPPY",
      columnData: [{ name: "id", data: [1, 2], type: "INT32" }],
    }),
  );

  await simAws
    .s3()
    .putObject({
      input: { Bucket: "data", Key: "wide/part-0.parquet", Body: body },
    });

  const got = await ask(simAws, "SELECT id, added_later FROM shop.wide");
  console.log(`  answeredBy ${got.by}`);
  for (const row of got.rows) {
    console.log(`  | ${row.join(" | ")}`);
  }
  console.log("  real Athena reads a column the file lacks as null.");
}

console.log("\n=== 5. An unpartitioned scan figure, Parquet against JSON ===");
{
  const columns = [{ Name: "id", Type: "int" }];
  const jsonSim = await simulation(json, columns);
  const body = Buffer.from('{"id":1}\n{"id":2}\n');

  await jsonSim
    .s3()
    .putObject({
      input: { Bucket: "data", Key: "wide/part-0.json", Body: body },
    });

  const got = await ask(jsonSim, "SELECT count(*) AS n FROM shop.wide");
  console.log(
    `  JSON object ${String(body.byteLength)} bytes, scanned ${String(got.scanned)}, answeredBy ${got.by}`,
  );
}

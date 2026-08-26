/**
 * Spike criterion 1. One Athena query answered from data seeded into
 * simulated S3, through a Glue table deployed from a CloudFormation template.
 */
import { SimAws } from "../src/index.js";
import { installShims, loadTable, runAthenaSql, sqliteFor } from "./engine.js";

const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-logs" } });
await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "rainlytics",
  template: {
    Resources: {
      LogDatabase: {
        Type: "AWS::Glue::Database",
        Properties: {
          CatalogId: { Ref: "AWS::AccountId" },
          DatabaseInput: { Name: "rainlytics" },
        },
      },
      LogTable: {
        Type: "AWS::Glue::Table",
        Properties: {
          CatalogId: { Ref: "AWS::AccountId" },
          DatabaseName: { Ref: "LogDatabase" },
          TableInput: {
            Name: "access_logs",
            TableType: "EXTERNAL_TABLE",
            PartitionKeys: [{ Name: "day", Type: "string" }],
            StorageDescriptor: {
              Columns: [
                { Name: "ts", Type: "string" },
                { Name: "url", Type: "string" },
                { Name: "status", Type: "int" },
                { Name: "bytes", Type: "bigint" },
              ],
              Location: "s3://rainlytics-logs/cloudfront/",
              SerdeInfo: {
                SerializationLibrary: "org.openx.data.jsonserde.JsonSerDe",
              },
            },
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const seeded = [
  [
    "day=2026-08-01",
    { ts: "2026-08-01T10:00:00Z", url: "/", status: 200, bytes: 1200 },
  ],
  [
    "day=2026-08-01",
    { ts: "2026-08-01T10:05:00Z", url: "/pricing", status: 404, bytes: 310 },
  ],
  [
    "day=2026-08-01",
    { ts: "2026-08-01T11:00:00Z", url: "/pricing", status: 404, bytes: 305 },
  ],
  [
    "day=2026-08-02",
    { ts: "2026-08-02T09:00:00Z", url: "/", status: 500, bytes: 90 },
  ],
  [
    "day=2026-08-02",
    { ts: "2026-08-02T09:30:00Z", url: "/docs", status: 404, bytes: 280 },
  ],
] as const;

const byPartition = new Map<string, string[]>();

for (const [partition, row] of seeded) {
  const lines = byPartition.get(partition) ?? [];
  lines.push(JSON.stringify(row));
  byPartition.set(partition, lines);
}

for (const [partition, lines] of byPartition) {
  await simAws.s3().putObject({
    input: {
      Bucket: "rainlytics-logs",
      Key: `cloudfront/${partition}/part-0.json`,
      Body: `${lines.join("\n")}\n`,
    },
  });
}

await simAws.athena().createWorkGroup({
  input: {
    Name: "rainlytics",
    Configuration: {
      ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
    },
  },
});

const sql =
  "SELECT url, count(*) AS hits, sum(bytes) AS total " +
  "FROM rainlytics.access_logs " +
  "WHERE status >= 400 AND day = '2026-08-01' " +
  "GROUP BY 1 ORDER BY hits DESC";

// The engine: Glue metadata, then S3 objects, then SQLite.
const loaded = await loadTable(simAws, "rainlytics", "access_logs");
const database = sqliteFor([loaded]);
installShims(database);

const outcome = runAthenaSql(database, sql);

console.log("--- loaded from simulated S3");
console.log(
  `${String(loaded.rows.length)} rows, ${String(loaded.bytesScanned)} bytes scanned`,
);
console.log("--- translated for SQLite");
console.log(outcome.sqlite);
console.log("--- engine rows");
console.log(outcome.rows);

if (!outcome.ok) {
  throw new Error(
    `engine failed at ${String(outcome.stage)}: ${String(outcome.error)}`,
  );
}

// Hand the computed rows to the real query lifecycle. The seam that would
// let the runner ask the engine directly is #1008's work.
const columns = Object.keys(outcome.rows?.[0] ?? {});

simAws
  .athena()
  .results()
  .onQuery(sql, {
    columns,
    rows: (outcome.rows ?? []).map((row) =>
      columns.map((column) => String(row[column])),
    ),
    bytesScanned: loaded.bytesScanned,
  });

const started = await simAws.athena().startQueryExecution({
  input: { QueryString: sql, WorkGroup: "rainlytics" },
});

await simAws.backgroundTasksComplete();

const execution = await simAws
  .athena()
  .getQueryExecution({ input: { QueryExecutionId: started.QueryExecutionId } });
const results = await simAws
  .athena()
  .getQueryResults({ input: { QueryExecutionId: started.QueryExecutionId } });

console.log("--- through the Athena lifecycle");
console.log("state:", execution.QueryExecution?.Status?.State);
console.log(
  "scanned:",
  execution.QueryExecution?.Statistics?.DataScannedInBytes,
);
console.log(
  "rows:",
  JSON.stringify(
    results.ResultSet?.Rows?.map((row) =>
      row.Data?.map((cell) => cell.VarCharValue),
    ),
  ),
);

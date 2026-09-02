/**
 * Spike criterion 1 and 2. Two Athena queries answered by the real engine over
 * Parquet objects in simulated S3. One file this spike wrote, and one written
 * outside this repository by parquet-mr, the Java writer Athena CTAS and Glue
 * both use.
 */
import { readFileSync } from "node:fs";

import { parquetWriteBuffer } from "hyparquet-writer";

import { SimAws } from "../../src/index.js";

const fixtures = process.argv[2] ?? "pq";
const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-data" } });
await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });

await simAws.athena().createWorkGroup({
  input: {
    Name: "rainlytics",
    Configuration: {
      ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
    },
  },
});

const parquetSerDe = {
  SerializationLibrary:
    "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe",
};

await simAws.cloudFormation().deployTemplate({
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
                { Name: "url", Type: "string" },
                { Name: "status", Type: "int" },
                { Name: "bytes", Type: "bigint" },
                { Name: "cached", Type: "boolean" },
                { Name: "latency", Type: "double" },
              ],
              Location: "s3://rainlytics-data/cloudfront/",
              SerdeInfo: parquetSerDe,
            },
          },
        },
      },
      CustomerTable: {
        Type: "AWS::Glue::Table",
        Properties: {
          CatalogId: { Ref: "AWS::AccountId" },
          DatabaseName: { Ref: "LogDatabase" },
          TableInput: {
            Name: "customers",
            TableType: "EXTERNAL_TABLE",
            StorageDescriptor: {
              Columns: [
                { Name: "c_first_name", Type: "string" },
                { Name: "c_birth_country", Type: "string" },
                { Name: "c_preferred_cust_flag", Type: "string" },
              ],
              Location: "s3://rainlytics-data/customers/",
              SerdeInfo: parquetSerDe,
            },
          },
        },
      },
    },
  },
});

/** Access log rows, written as Parquet with the codec Athena and Glue write. */
function accessLogParquet(
  rows: readonly {
    url: string;
    status: number;
    bytes: bigint;
    cached: boolean;
    latency: number;
  }[],
): Buffer {
  return Buffer.from(
    parquetWriteBuffer({
      codec: "SNAPPY",
      columnData: [
        { name: "url", data: rows.map((row) => row.url), type: "STRING" },
        { name: "status", data: rows.map((row) => row.status), type: "INT32" },
        { name: "bytes", data: rows.map((row) => row.bytes), type: "INT64" },
        {
          name: "cached",
          data: rows.map((row) => row.cached),
          type: "BOOLEAN",
        },
        {
          name: "latency",
          data: rows.map((row) => row.latency),
          type: "DOUBLE",
        },
      ],
    }),
  );
}

// Two Hive style partitions, the way Glue lays a table out.
await simAws.s3().putObject({
  input: {
    Bucket: "rainlytics-data",
    Key: "cloudfront/day=2026-08-01/part-00000-c000.snappy.parquet",
    Body: accessLogParquet([
      { url: "/", status: 200, bytes: 1200n, cached: true, latency: 12.5 },
      {
        url: "/pricing",
        status: 404,
        bytes: 310n,
        cached: false,
        latency: 41.25,
      },
      {
        url: "/pricing",
        status: 404,
        bytes: 305n,
        cached: false,
        latency: 38.5,
      },
    ]),
  },
});

await simAws.s3().putObject({
  input: {
    Bucket: "rainlytics-data",
    Key: "cloudfront/day=2026-08-02/part-00000-c000.snappy.parquet",
    Body: accessLogParquet([
      { url: "/", status: 500, bytes: 90n, cached: false, latency: 900.75 },
      { url: "/docs", status: 404, bytes: 280n, cached: true, latency: 8.125 },
    ]),
  },
});

// The file this repository did not write.
await simAws.s3().putObject({
  input: {
    Bucket: "rainlytics-data",
    Key: "customers/delta_byte_array.parquet",
    Body: readFileSync(`${fixtures}/delta_byte_array.parquet`),
  },
});

await simAws.athena().engine().enable();

/** Run one query on the real execution lifecycle and read the rows back. */
async function ask(sql: string): Promise<void> {
  const started = await simAws.athena().startQueryExecution({
    input: { QueryString: sql, WorkGroup: "rainlytics" },
  });

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

  console.log(`\n${sql}`);
  console.log(
    `  state       ${described.QueryExecution?.Status?.State ?? "?"}` +
      `${described.QueryExecution?.Status?.StateChangeReason ?? ""}`,
  );
  console.log(`  answeredBy  ${execution?.answeredBy ?? "?"}`);
  console.log(
    `  scanned     ${String(described.QueryExecution?.Statistics?.DataScannedInBytes ?? 0)} bytes`,
  );

  for (const row of results.ResultSet?.Rows ?? []) {
    console.log(
      `  | ${(row.Data ?? []).map((cell) => cell.VarCharValue ?? "").join(" | ")}`,
    );
  }
}

await ask(
  "SELECT url, count(*) AS hits, sum(bytes) AS total, avg(latency) AS mean " +
    "FROM rainlytics.access_logs " +
    "WHERE status >= 400 AND day = '2026-08-01' " +
    "GROUP BY 1 ORDER BY hits DESC",
);

await ask(
  "SELECT url, cached, bytes FROM rainlytics.access_logs " +
    "WHERE cached = true ORDER BY bytes DESC",
);

await ask(
  "SELECT c_birth_country, count(*) AS people " +
    "FROM rainlytics.customers " +
    "WHERE c_preferred_cust_flag = 'Y' " +
    "GROUP BY 1 ORDER BY people DESC, 1 ASC LIMIT 5",
);

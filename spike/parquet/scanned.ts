/** What DataScannedInBytes reports for a Parquet table, against the objects. */
import { parquetWriteBuffer } from "hyparquet-writer";

import { SimAws } from "../../src/index.js";

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
            Name: "orders",
            TableType: "EXTERNAL_TABLE",
            PartitionKeys: [{ Name: "day", Type: "string" }],
            StorageDescriptor: {
              Columns: [
                { Name: "id", Type: "int" },
                { Name: "note", Type: "string" },
              ],
              Location: "s3://data/orders/",
              SerdeInfo: {
                SerializationLibrary:
                  "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe",
              },
            },
          },
        },
      },
    },
  },
});

function file(count: number, note: string): Buffer {
  return Buffer.from(
    parquetWriteBuffer({
      codec: "SNAPPY",
      columnData: [
        {
          name: "id",
          data: Array.from({ length: count }, (_, index) => index),
          type: "INT32",
        },
        {
          name: "note",
          data: Array.from({ length: count }, () => note),
          type: "STRING",
        },
      ],
    }),
  );
}

for (const [day, count, note] of [
  ["2026-08-01", 10, "small"],
  ["2026-08-02", 400, "a much longer note to make this partition bigger"],
] as const) {
  const body = file(count, note);

  await simAws.s3().putObject({
    input: {
      Bucket: "data",
      Key: `orders/day=${day}/part-0.parquet`,
      Body: body,
    },
  });
  console.log(`day=${day} object is ${String(body.byteLength)} bytes`);
}

await simAws.athena().engine().enable();

async function ask(sql: string): Promise<void> {
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

  console.log(
    `\n${sql}\n  scanned ${String(described.QueryExecution?.Statistics?.DataScannedInBytes ?? 0)} bytes` +
      `, rows ${String((results.ResultSet?.Rows ?? []).length - 1)}` +
      `, answer ${(results.ResultSet?.Rows ?? [])[1]?.Data?.[0]?.VarCharValue ?? ""}`,
  );
}

await ask("SELECT count(*) AS n FROM shop.orders");
await ask("SELECT count(*) AS n FROM shop.orders WHERE day = '2026-08-01'");
await ask("SELECT count(*) AS n FROM shop.orders WHERE day = '2026-08-02'");
await ask(
  "SELECT count(DISTINCT id) AS n FROM shop.orders WHERE day = '2026-08-01'",
);

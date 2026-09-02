/**
 * What a Parquet table does when the engine cannot read the object, and what
 * the optional peer dependency shape costs.
 */
import { parquetWriteBuffer } from "hyparquet-writer";

import { SimAws } from "../../src/index.js";

async function tableWith(body: Buffer | string): Promise<string> {
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
              Name: "t",
              TableType: "EXTERNAL_TABLE",
              StorageDescriptor: {
                Columns: [{ Name: "id", Type: "int" }],
                Location: "s3://data/t/",
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

  await simAws
    .s3()
    .putObject({
      input: { Bucket: "data", Key: "t/part-0.parquet", Body: body },
    });

  await simAws.athena().engine().enable();
  simAws
    .athena()
    .results()
    .byDefault({ columns: ["id"], rows: [["declared"]] });

  const started = await simAws.athena().startQueryExecution({
    input: { QueryString: "SELECT id FROM shop.t", WorkGroup: "wg" },
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

  return (
    `state ${described.QueryExecution?.Status?.State ?? "?"}` +
    `, answeredBy ${execution?.answeredBy ?? "?"}` +
    `, first row ${JSON.stringify((results.ResultSet?.Rows ?? [])[1]?.Data?.[0]?.VarCharValue)}`
  );
}

console.log("=== A Parquet object the engine can read ===");
console.log(
  `  ${await tableWith(
    Buffer.from(
      parquetWriteBuffer({
        codec: "SNAPPY",
        columnData: [{ name: "id", data: [7], type: "INT32" }],
      }),
    ),
  )}`,
);

console.log("\n=== An object under a Parquet table that is not Parquet ===");
console.log(`  ${await tableWith(Buffer.from('{"id":1}\n'))}`);

console.log("\n=== A Parquet object in a codec nothing here decompresses ===");
console.log(
  `  ${await tableWith(
    Buffer.from(
      parquetWriteBuffer({
        codec: "LZ4_RAW",
        columnData: [{ name: "id", data: [7], type: "INT32" }],
      }),
    ),
  )}`,
);

console.log("\n=== A truncated Parquet object ===");
{
  const whole = Buffer.from(
    parquetWriteBuffer({
      codec: "SNAPPY",
      columnData: [{ name: "id", data: [7], type: "INT32" }],
    }),
  );

  console.log(`  ${await tableWith(whole.subarray(0, whole.byteLength - 40))}`);
}

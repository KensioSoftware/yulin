/**
 * A query over a table whose partitions the catalog holds.
 */

import {
  CreateDatabaseCommand,
  CreatePartitionCommand,
  CreateTableCommand,
} from "@aws-sdk/client-glue";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const glue = simAws.glue();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-logs" } });
await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });

glue.createDatabase(
  new CreateDatabaseCommand({ DatabaseInput: { Name: "rainlytics" } }),
);
glue.createTable(
  new CreateTableCommand({
    DatabaseName: "rainlytics",
    TableInput: {
      Name: "access_logs",
      PartitionKeys: [{ Name: "day", Type: "string" }],
      StorageDescriptor: { Location: "s3://rainlytics-logs/logs/" },
    },
  }),
);

for (const day of ["2026-08-25", "2026-08-26"]) {
  glue.createPartition(
    new CreatePartitionCommand({
      DatabaseName: "rainlytics",
      TableName: "access_logs",
      PartitionInput: {
        Values: [day],
        StorageDescriptor: { Location: `s3://rainlytics-logs/logs/${day}/` },
      },
    }),
  );

  await simAws.s3().putObject({
    input: {
      Bucket: "rainlytics-logs",
      Key: `logs/${day}/part-0.json`,
      Body: "x".repeat(1000),
    },
  });
}

const { QueryExecutionId } = await simAws.athena().startQueryExecution({
  input: {
    QueryString:
      "SELECT url FROM rainlytics.access_logs WHERE day = '2026-08-26'",
    ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
  },
});

await simAws.backgroundTasksComplete();

const execution = await simAws
  .athena()
  .getQueryExecution({ input: { QueryExecutionId } });

// 1000
console.log(execution.QueryExecution?.Statistics?.DataScannedInBytes);

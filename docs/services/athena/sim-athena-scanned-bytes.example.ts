/**
 * A query measured against the objects a test seeded.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
await simAws.s3().createBucket({ input: { Bucket: "rainlytics-logs" } });
await simAws.athena().createWorkGroup({
  input: {
    Name: "rainlytics",
    Configuration: {
      ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
    },
  },
});

simAws.glue().createDatabase({
  input: { DatabaseInput: { Name: "rainlytics" } },
});
simAws.glue().createTable({
  input: {
    DatabaseName: "rainlytics",
    TableInput: {
      Name: "access_logs",
      StorageDescriptor: { Location: "s3://rainlytics-logs/logs/" },
    },
  },
});

await simAws.s3().putObject({
  input: {
    Bucket: "rainlytics-logs",
    Key: "logs/part-0.json",
    Body: "x".repeat(1200),
  },
});

const started = await simAws.athena().startQueryExecution({
  input: {
    QueryString: "SELECT cs_uri_stem FROM rainlytics.access_logs",
    WorkGroup: "rainlytics",
  },
});

await simAws.backgroundTasksComplete();

const execution = await simAws.athena().getQueryExecution({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// 1200
console.log(execution.QueryExecution?.Statistics?.DataScannedInBytes);

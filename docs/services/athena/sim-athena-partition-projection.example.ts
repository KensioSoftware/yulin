/**
 * A table whose projected date range names a month that does not exist.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
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
      PartitionKeys: [{ Name: "day", Type: "string" }],
      StorageDescriptor: { Location: "s3://rainlytics-logs/cloudfront/" },
      Parameters: {
        "projection.enabled": "true",
        "projection.day.type": "date",
        "projection.day.format": "yyyy-MM-dd",
        "projection.day.range": "2026-13-01,NOW",
        // eslint-disable-next-line no-template-curly-in-string
        "storage.location.template": "s3://rainlytics-logs/logs/${day}/",
      },
    },
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

// "FAILED"
console.log(execution.QueryExecution?.Status?.State);
// INVALID_TABLE_PROPERTY, naming day and the bound it could not read
console.log(execution.QueryExecution?.Status?.StateChangeReason);

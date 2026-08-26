/**
 * A query naming a table the Data Catalog has never heard of.
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

simAws
  .glue()
  .createDatabase({ input: { DatabaseInput: { Name: "rainlytics" } } });
simAws.glue().createTable({
  input: {
    DatabaseName: "rainlytics",
    TableInput: { Name: "access_logs" },
  },
});

const started = await simAws.athena().startQueryExecution({
  input: {
    QueryString: "SELECT cs_uri_stem FROM rainlytics.acess_logs",
    WorkGroup: "rainlytics",
  },
});

await simAws.backgroundTasksComplete();

const execution = await simAws.athena().getQueryExecution({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// "FAILED"
console.log(execution.QueryExecution?.Status?.State);
// names awsdatacatalog.rainlytics.acess_logs
console.log(execution.QueryExecution?.Status?.StateChangeReason);

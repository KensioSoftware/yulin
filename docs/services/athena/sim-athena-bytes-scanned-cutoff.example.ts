/**
 * A workgroup's cost guardrail refusing a query that scans too much.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
await simAws.athena().createWorkGroup({
  input: {
    Name: "rainlytics",
    Configuration: {
      BytesScannedCutoffPerQuery: 10_000_000,
      ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
    },
  },
});

const unpartitioned = "SELECT * FROM rainlytics.access_logs";

simAws
  .athena()
  .results()
  .onQuery(unpartitioned, { rows: [["4213"]], bytesScanned: 40_000_000 });

const started = await simAws.athena().startQueryExecution({
  input: { QueryString: unpartitioned, WorkGroup: "rainlytics" },
});

await simAws.backgroundTasksComplete();

const execution = await simAws.athena().getQueryExecution({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// "FAILED"
console.log(execution.QueryExecution?.Status?.State);

// Names the limit and what the query scanned.
console.log(execution.QueryExecution?.Status?.StateChangeReason);

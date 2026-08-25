/**
 * Declaring what a query answers, running it, and reading the rows back.
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

const sql = "SELECT cs_uri_stem, count(*) FROM access_logs GROUP BY 1";

simAws
  .athena()
  .results()
  .onQuery(sql, {
    columns: ["cs_uri_stem", "views"],
    rows: [["/", "4213"]],
    bytesScanned: 2_000_000,
  });

const started = await simAws.athena().startQueryExecution({
  input: { QueryString: sql, WorkGroup: "rainlytics" },
});

await simAws.backgroundTasksComplete();

const results = await simAws.athena().getQueryResults({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// "4213". The first row holds the column names, as it does on real Athena.
console.log(results.ResultSet?.Rows?.[1]?.Data?.[1]?.VarCharValue);

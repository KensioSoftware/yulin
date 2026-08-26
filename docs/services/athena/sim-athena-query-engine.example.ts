/**
 * A query answered from the objects a test seeded, rather than from a
 * declaration.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket({ input: { Bucket: "rainlytics-logs" } });
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
      StorageDescriptor: {
        Columns: [
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
});

await simAws.s3().putObject({
  input: {
    Bucket: "rainlytics-logs",
    Key: "cloudfront/day=2026-08-01/part-0.json",
    Body: [
      '{"url":"/","status":200,"bytes":1200}',
      '{"url":"/pricing","status":404,"bytes":310}',
      '{"url":"/pricing","status":404,"bytes":305}',
    ].join("\n"),
  },
});

// node-sql-parser has to be in the project for this line to work.
await simAws.athena().engine().enable();

const started = await simAws.athena().startQueryExecution({
  input: {
    QueryString:
      "SELECT url, count(*) AS hits, sum(bytes) AS total " +
      "FROM rainlytics.access_logs WHERE status >= 400 AND day = '2026-08-01' " +
      "GROUP BY url ORDER BY hits DESC",
    WorkGroup: "rainlytics",
  },
});

await simAws.backgroundTasksComplete();

const results = await simAws.athena().getQueryResults({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// ["/pricing", "2", "615"], computed from the objects.
console.log(
  results.ResultSet?.Rows?.[1]?.Data?.map((cell) => cell.VarCharValue),
);

// "engine", which is how a test proves the rows came from the data.
console.log(simAws.athena().queryExecutions()[0]?.answeredBy);

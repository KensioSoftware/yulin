/**
 * A query the engine cannot run, failing rather than falling back to a
 * declaration nobody meant to use.
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
      Name: "orders",
      StorageDescriptor: {
        Columns: [{ Name: "id", Type: "int" }],
        Location: "s3://rainlytics-logs/orders/",
        SerdeInfo: {
          SerializationLibrary: "org.apache.hadoop.hive.ql.io.orc.OrcSerde",
        },
      },
    },
  },
});

// Without this the query below succeeds, answering with the declared rows.
simAws
  .athena()
  .results()
  .byDefault({ columns: ["id"], rows: [["1"]] });

await simAws.athena().engine().enable({ strict: true });

const started = await simAws.athena().startQueryExecution({
  input: {
    QueryString: "SELECT id FROM rainlytics.orders",
    WorkGroup: "rainlytics",
  },
});

await simAws.backgroundTasksComplete();

const described = await simAws.athena().getQueryExecution({
  input: { QueryExecutionId: started.QueryExecutionId },
});

// "FAILED", because nothing here reads ORC.
console.log(described.QueryExecution?.Status?.State);

// The reason names the SerDe, the table declaring it, and what to do instead.
console.log(described.QueryExecution?.Status?.StateChangeReason);

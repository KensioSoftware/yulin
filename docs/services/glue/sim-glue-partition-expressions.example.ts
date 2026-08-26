/**
 * Reading back the partitions an expression matches.
 */

import {
  BatchCreatePartitionCommand,
  CreateDatabaseCommand,
  CreateTableCommand,
  GetPartitionsCommand,
} from "@aws-sdk/client-glue";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const glue = simAws.glue();

glue.createDatabase(
  new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
);
glue.createTable(
  new CreateTableCommand({
    DatabaseName: "site_logs",
    TableInput: {
      Name: "access_logs",
      PartitionKeys: [
        { Name: "day", Type: "string" },
        { Name: "region", Type: "string" },
      ],
    },
  }),
);

glue.batchCreatePartition(
  new BatchCreatePartitionCommand({
    DatabaseName: "site_logs",
    TableName: "access_logs",
    PartitionInputList: [
      { Values: ["2026-07-31", "eu-west-2"] },
      { Values: ["2026-08-01", "eu-west-2"] },
      { Values: ["2026-08-02", "us-east-1"] },
    ],
  }),
);

const { Partitions } = glue.getPartitions(
  new GetPartitionsCommand({
    DatabaseName: "site_logs",
    TableName: "access_logs",
    Expression: "day >= '2026-08-01' AND region IN ('eu-west-2', 'us-east-1')",
  }),
);

// [["2026-08-01","eu-west-2"],["2026-08-02","us-east-1"]]
console.log(JSON.stringify(Partitions.map((partition) => partition.Values)));

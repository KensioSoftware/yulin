/**
 * Registering two days of partitions against a table, then listing them.
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
      PartitionKeys: [{ Name: "day", Type: "string" }],
      StorageDescriptor: { Location: "s3://site-logs/cloudfront/" },
    },
  }),
);

const { Errors } = glue.batchCreatePartition(
  new BatchCreatePartitionCommand({
    DatabaseName: "site_logs",
    TableName: "access_logs",
    PartitionInputList: [
      {
        Values: ["2026-08-25"],
        StorageDescriptor: {
          Location: "s3://site-logs/cloudfront/day=2026-08-25/",
        },
      },
      {
        Values: ["2026-08-26"],
        StorageDescriptor: {
          Location: "s3://site-logs/cloudfront/day=2026-08-26/",
        },
      },
    ],
  }),
);

const { Partitions } = glue.getPartitions(
  new GetPartitionsCommand({
    DatabaseName: "site_logs",
    TableName: "access_logs",
  }),
);

// 0
console.log(Errors.length);
// s3://site-logs/cloudfront/day=2026-08-26/
console.log(Partitions[1]?.StorageDescriptor?.Location);

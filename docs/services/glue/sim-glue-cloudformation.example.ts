/**
 * Deploying a Glue database and a table, then reading the table back.
 */

import { GetTableCommand } from "@aws-sdk/client-glue";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "analytics-stack",
  template: {
    Resources: {
      LogDatabase: {
        Type: "AWS::Glue::Database",
        Properties: {
          CatalogId: { Ref: "AWS::AccountId" },
          DatabaseInput: { Name: "site_logs" },
        },
      },
      LogTable: {
        Type: "AWS::Glue::Table",
        Properties: {
          CatalogId: { Ref: "AWS::AccountId" },
          DatabaseName: { Ref: "LogDatabase" },
          TableInput: {
            Name: "access_logs",
            TableType: "EXTERNAL_TABLE",
            PartitionKeys: [{ Name: "year", Type: "string" }],
            StorageDescriptor: {
              Columns: [{ Name: "status", Type: "int" }],
              Location: "s3://site-logs/cloudfront/",
            },
            Parameters: {
              "projection.enabled": "true",
              "projection.year.type": "date",
              "projection.year.format": "yyyy",
              "projection.year.range": "2026,NOW",
              // eslint-disable-next-line no-template-curly-in-string
              "storage.location.template": "s3://site-logs/cloudfront/${year}/",
            },
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const { Table } = simAws
  .glue()
  .getTable(
    new GetTableCommand({ DatabaseName: "site_logs", Name: "access_logs" }),
  );

// true
console.log(Table.Parameters["projection.enabled"]);

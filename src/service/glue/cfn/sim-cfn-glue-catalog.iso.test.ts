import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

/**
 * Where a projected partition's objects sit, written the way Athena reads it.
 */
// oxlint-disable-next-line no-template-curly-in-string -- Athena projection template, not a JavaScript template.
const locationTemplate = "s3://site-logs/cloudfront/${year}/${month}/";

/**
 * A stack laying out CloudFront access logs the way a delivery writes them,
 * read back with Athena partition projection rather than registered
 * partitions.
 */
const catalogTemplate = {
  Resources: {
    LogDatabase: {
      Type: "AWS::Glue::Database",
      Properties: {
        CatalogId: { Ref: "AWS::AccountId" },
        DatabaseInput: {
          Name: "site_logs",
          Description: "CloudFront access logs",
        },
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
          PartitionKeys: [
            { Name: "year", Type: "string" },
            { Name: "month", Type: "string" },
          ],
          StorageDescriptor: {
            Columns: [
              { Name: "request_time", Type: "timestamp" },
              { Name: "status", Type: "int" },
            ],
            Location: "s3://site-logs/cloudfront/",
            InputFormat: "org.apache.hadoop.mapred.TextInputFormat",
            OutputFormat:
              "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
            SerdeInfo: {
              SerializationLibrary:
                "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe",
              Parameters: { "field.delim": "\t" },
            },
          },
          Parameters: {
            "projection.enabled": "true",
            "projection.year.type": "date",
            "projection.year.format": "yyyy",
            "projection.year.range": "2026,NOW",
            "projection.year.interval": "1",
            "projection.year.interval.unit": "YEARS",
            "projection.month.type": "integer",
            "projection.month.range": "1,12",
            "projection.month.digits": "2",
            "storage.location.template": locationTemplate,
          },
        },
      },
    },
  },
  Outputs: {
    DatabaseRef: { Value: { Ref: "LogDatabase" } },
    TableRef: { Value: { Ref: "LogTable" } },
  },
};

describe("AWS::Glue::Database and AWS::Glue::Table", () => {
  it("creates the database and table a template declares", async () => {
    // Given a template declaring a Glue database and a table in it.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "analytics-stack",
      template: catalogTemplate,
    });

    await stack.waitForDeployComplete();

    // Then neither Resource was skipped, and both answer Ref with their name.
    assertArrayLength(stack.skippedResources, 0);
    assertIdentical(stack.outputs.get("DatabaseRef")?.value, "site_logs");
    assertIdentical(stack.outputs.get("TableRef")?.value, "access_logs");

    const database = simAws.glue().findDatabase("site_logs");

    assertNonNullable(database);
    assertIdentical(database.description, "CloudFront access logs");

    await simAws.backgroundTasksComplete();
  });

  it("keeps the table parameters a projection is configured through", async () => {
    // Given a deployed stack whose table carries Athena partition projection.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "analytics-stack",
      template: catalogTemplate,
    });

    await stack.waitForDeployComplete();

    // When the table is read back through GetTable.
    const { Table } = simAws.glue().getTable({
      input: { DatabaseName: "site_logs", Name: "access_logs" },
    });

    // Then every projection parameter is there, entry for entry. A table that
    // dropped them would look deployed while projecting nothing.
    assertObjectEquals(Table.Parameters, {
      "projection.enabled": "true",
      "projection.year.type": "date",
      "projection.year.format": "yyyy",
      "projection.year.range": "2026,NOW",
      "projection.year.interval": "1",
      "projection.year.interval.unit": "YEARS",
      "projection.month.type": "integer",
      "projection.month.range": "1,12",
      "projection.month.digits": "2",
      "storage.location.template": locationTemplate,
    });

    await simAws.backgroundTasksComplete();
  });

  it("keeps the storage descriptor and partition keys in declared order", async () => {
    // Given a deployed stack whose table declares columns and partition keys.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "analytics-stack",
      template: catalogTemplate,
    });

    await stack.waitForDeployComplete();

    // When the table is read back.
    const { Table } = simAws.glue().getTable({
      input: { DatabaseName: "site_logs", Name: "access_logs" },
    });

    // Then the columns keep their order, the partition keys keep theirs, and
    // the two stay apart the way real Glue keeps them.
    assertObjectEquals(Table.StorageDescriptor?.Columns, [
      { Name: "request_time", Type: "timestamp" },
      { Name: "status", Type: "int" },
    ]);
    assertObjectEquals(Table.PartitionKeys, [
      { Name: "year", Type: "string" },
      { Name: "month", Type: "string" },
    ]);
    assertIdentical(
      Table.StorageDescriptor.Location,
      "s3://site-logs/cloudfront/",
    );
    assertIdentical(
      Table.StorageDescriptor.SerdeInfo?.SerializationLibrary,
      "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe",
    );
    assertIdentical(Table.TableType, "EXTERNAL_TABLE");

    await simAws.backgroundTasksComplete();
  });

  it("deletes the database and table when the stack goes", async () => {
    // Given a deployed stack holding a database and a table.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "analytics-stack",
      template: catalogTemplate,
    });

    await stack.waitForDeployComplete();

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack({ input: { StackName: "analytics-stack" } });
    await simAws.backgroundTasksComplete();

    // Then the catalog holds neither.
    assertUndefined(simAws.glue().findDatabase("site_logs"));
    assertUndefined(simAws.glue().findTable("site_logs", "access_logs"));
  });
});

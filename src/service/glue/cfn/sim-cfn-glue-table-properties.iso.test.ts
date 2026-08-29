import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

async function deploy(
  simAws: SimAws,
  resources: Record<string, SimCfnTemplateValueRecord>,
): Promise<void> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "analytics-stack",
    template: { Resources: resources },
  });

  await stack.waitForDeployComplete();
}

const database: SimCfnTemplateValueRecord = {
  Type: "AWS::Glue::Database",
  Properties: { DatabaseInput: { Name: "site_logs" } },
};

describe("AWS::Glue::Table storage descriptor", () => {
  it("reads the bucketing and compression a descriptor declares", async () => {
    // Given a template declaring a bucketed, compressed layout.
    const simAws = new SimAws();

    // When it is deployed.
    await deploy(simAws, {
      LogDatabase: database,
      LogTable: {
        Type: "AWS::Glue::Table",
        Properties: {
          DatabaseName: { Ref: "LogDatabase" },
          TableInput: {
            Name: "access_logs",
            Description: "Delivered access logs",
            Owner: "analytics",
            Retention: 30,
            StorageDescriptor: {
              Columns: [
                { Name: "status", Type: "int", Comment: "HTTP status" },
              ],
              Compressed: true,
              NumberOfBuckets: 4,
              BucketColumns: ["status"],
              Parameters: { "skip.header.line.count": "1" },
            },
          },
        },
      },
    });

    // Then each field reads back as it was declared.
    const table = simAws.glue().findTable("site_logs", "access_logs");

    assertNonNullable(table);

    const descriptor = table.storageDescriptor;

    assertNonNullable(descriptor);
    assertIdentical(table.description, "Delivered access logs");
    assertIdentical(table.owner, "analytics");
    assertIdentical(table.retention, 30);
    assertTrue(descriptor.Compressed ?? false);
    assertIdentical(descriptor.NumberOfBuckets, 4);
    assertIdentical(descriptor.BucketColumns?.[0], "status");
    assertIdentical(descriptor.Columns?.[0]?.Comment, "HTTP status");
    assertIdentical(descriptor.Parameters?.["skip.header.line.count"], "1");

    await simAws.backgroundTasksComplete();
  });

  it("writes a number or a boolean parameter out as its text", async () => {
    // Given a template whose projection parameters were written unquoted, the
    // way YAML leaves them.
    const simAws = new SimAws();

    // When it is deployed.
    await deploy(simAws, {
      LogDatabase: database,
      LogTable: {
        Type: "AWS::Glue::Table",
        Properties: {
          DatabaseName: { Ref: "LogDatabase" },
          TableInput: {
            Name: "access_logs",
            Parameters: { "projection.enabled": true, "retention.days": 30 },
          },
        },
      },
    });

    // Then each becomes its text, which is what real Glue receives from
    // CloudFormation.
    const table = simAws.glue().findTable("site_logs", "access_logs");

    assertNonNullable(table);
    assertIdentical(table.parameters["projection.enabled"], "true");
    assertIdentical(table.parameters["retention.days"], "30");

    await simAws.backgroundTasksComplete();
  });

  it("names the property whose type it refuses", async () => {
    // Given a template declaring a descriptor field as the wrong type.
    const simAws = new SimAws();

    // When it is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "analytics-stack",
        template: {
          Resources: {
            LogDatabase: database,
            LogTable: {
              Type: "AWS::Glue::Table",
              Properties: {
                DatabaseName: { Ref: "LogDatabase" },
                TableInput: {
                  Name: "access_logs",
                  StorageDescriptor: { Compressed: "yes" },
                },
              },
            },
          },
        },
      });
    });

    // Then the refusal names the whole way to it.
    assertStringIncludes(
      error.message,
      "TableInput.StorageDescriptor.Compressed must be a boolean",
    );
  });

  it("records a table property outside the ones it reads", async () => {
    // Given a template declaring an open table format and a property no Glue
    // resource has, which is what a typo looks like.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "analytics-stack",
      template: {
        Resources: {
          LogDatabase: database,
          LogTable: {
            Type: "AWS::Glue::Table",
            Properties: {
              DatabaseName: { Ref: "LogDatabase" },
              OpenTableFormatInput: { IcebergInput: { Version: "2" } },
              TabelInput: { Name: "typo" },
              TableInput: { Name: "access_logs" },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the table is created, and both are reported.
    assertNonNullable(simAws.glue().findTable("site_logs", "access_logs"));

    const reasons = stack.ignoredProperties
      .filter((property) => property.logicalId === "LogTable")
      .map((property) => property.reason)
      .join(" ");

    assertStringIncludes(reasons, "no Iceberg metadata is written");
    assertStringIncludes(reasons, "TabelInput is not a AWS::Glue::Table");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a Retention that is not a number", async () => {
    // Given a template declaring one as text.
    const simAws = new SimAws();

    // When it is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "analytics-stack",
        template: {
          Resources: {
            LogDatabase: database,
            LogTable: {
              Type: "AWS::Glue::Table",
              Properties: {
                DatabaseName: { Ref: "LogDatabase" },
                TableInput: { Name: "access_logs", Retention: "thirty" },
              },
            },
          },
        },
      });
    });

    // Then the refusal names the property.
    assertStringIncludes(
      error.message,
      "TableInput.Retention must be a number",
    );
  });

  it("refuses a second table of one name in one database", async () => {
    // Given a template declaring the same table twice.
    const simAws = new SimAws();

    // When it is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "analytics-stack",
        template: {
          Resources: {
            LogDatabase: database,
            LogTable: {
              Type: "AWS::Glue::Table",
              Properties: {
                DatabaseName: { Ref: "LogDatabase" },
                TableInput: { Name: "access_logs" },
              },
            },
            OtherLogTable: {
              Type: "AWS::Glue::Table",
              Properties: {
                DatabaseName: { Ref: "LogDatabase" },
                TableInput: { Name: "access_logs" },
              },
            },
          },
        },
      });
    });

    // Then it fails the way two CreateTable calls would.
    assertStringIncludes(error.message, "Table already exists");
  });

  it("refuses a table with no TableInput", async () => {
    // Given a template leaving out the property real Glue requires.
    const simAws = new SimAws();

    // When it is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "analytics-stack",
        template: {
          Resources: {
            LogDatabase: database,
            LogTable: {
              Type: "AWS::Glue::Table",
              Properties: { DatabaseName: { Ref: "LogDatabase" } },
            },
          },
        },
      });
    });

    // Then it is refused.
    assertStringIncludes(error.message, "TableInput is required");
  });

  it("names an unnamed table after the stack and the logical ID", async () => {
    // Given a template declaring a table with no name in its TableInput.
    const simAws = new SimAws();

    // When it is deployed.
    await deploy(simAws, {
      LogDatabase: database,
      LogTable: {
        Type: "AWS::Glue::Table",
        Properties: {
          DatabaseName: { Ref: "LogDatabase" },
          TableInput: { TableType: "EXTERNAL_TABLE" },
        },
      },
    });

    // Then the name is built from the stack and the logical ID, and ends in
    // the tail CloudFormation puts on a name it generates.
    const [created] = simAws.glue().tablesInDatabase("site_logs");

    assertNonNullable(created);
    assertStringStartsWith(created.name, "analytics-stack-logtable-");
    assertUndefined(simAws.glue().findTable("site_logs", "LogTable"));

    await simAws.backgroundTasksComplete();
  });
});

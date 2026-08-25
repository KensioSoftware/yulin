import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const database = {
  Type: "AWS::Glue::Database",
  Properties: { DatabaseInput: { Name: "site_logs" } },
};

describe("AWS::Glue::Table refusals", () => {
  it("fails a table whose database no stack created", async () => {
    // Given a template declaring a table in a database nothing creates.
    const simAws = new SimAws();

    // When it is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "analytics-stack",
        template: {
          Resources: {
            LogTable: {
              Type: "AWS::Glue::Table",
              Properties: {
                DatabaseName: "missing_logs",
                TableInput: { Name: "access_logs" },
              },
            },
          },
        },
      });
    });

    // Then the deploy fails with the refusal CreateTable gives, because the
    // Resource is created through the same store.
    assertStringIncludes(error.message, "missing_logs");

    const stack = simAws.cloudFormation().getStackByName("analytics-stack");

    assertNonNullable(stack);
    assertIdentical(stack.getResource("LogTable")?.status, "CREATE_FAILED");
    assertUndefined(simAws.glue().findTable("missing_logs", "access_logs"));
  });

  it("refuses another account's Data Catalog", async () => {
    // Given a template naming a CatalogId outside the simulated account.
    const simAws = new SimAws({ defaultAccountId: "111111111111" });

    // When it is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "analytics-stack",
        template: {
          Resources: {
            LogDatabase: {
              Type: "AWS::Glue::Database",
              Properties: {
                CatalogId: "222222222222",
                DatabaseInput: { Name: "site_logs" },
              },
            },
          },
        },
      });
    });

    // Then the deploy fails rather than creating the database in this
    // account's catalog, which the template never asked for.
    assertStringIncludes(error.message, "Cross-account");
    assertUndefined(simAws.glue().findDatabase("site_logs"));
  });

  it("answers Fn::GetAtt Id with a value AWS documents no format for", async () => {
    // Given a template reading the table's one documented attribute.
    const simAws = new SimAws({ defaultAccountId: "111111111111" });

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
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
        },
        Outputs: {
          TableId: { Value: { "Fn::GetAtt": ["LogTable", "Id"] } },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then it resolves to the catalog, the database and the table joined.
    // CloudFormation documents that this attribute exists and documents
    // nothing about its value, so this format is a guess and a real deploy may
    // disagree with it. `simGlueTableCfnId` is the one place to correct.
    assertIdentical(
      stack.outputs.get("TableId")?.value,
      "111111111111|site_logs|access_logs",
    );

    await simAws.backgroundTasksComplete();
  });
});

describe("AWS::Glue::Table unsimulated properties", () => {
  it("records what the table is created without, and creates it anyway", async () => {
    // Given a template declaring a view and a sorted storage layout, neither
    // of which this simulation acts on.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
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
                ViewOriginalText: "SELECT 1",
                StorageDescriptor: {
                  Location: "s3://site-logs/",
                  SortColumns: [{ Column: "status", SortOrder: 1 }],
                },
              },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the table is there, and each unread property is reported.
    assertNonNullable(simAws.glue().findTable("site_logs", "access_logs"));

    const paths = stack.ignoredProperties
      .filter((property) => property.logicalId === "LogTable")
      .map((property) => property.path);

    assertArrayLength(paths, 2);
    assertStringIncludes(paths.join(" "), "TableInput.ViewOriginalText");
    assertStringIncludes(
      paths.join(" "),
      "TableInput.StorageDescriptor.SortColumns",
    );

    await simAws.backgroundTasksComplete();
  });
});

import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { glueValueAdapter } from "../../cloudformation/resource/cfn/glue/sim-glue-cfn-value-adapter.js";
import { SimGlueTableCfn } from "../../cloudformation/resource/cfn/glue/sim-glue-table-cfn.js";
import { SimGlueInvalidInputException } from "../error/sim-glue.error.js";
import { SimGlueTable } from "../table/sim-glue-table.js";

describe("glueValueAdapter", () => {
  it("claims nothing for a Resource type Glue does not own", () => {
    // Given a Resource of another service's type.
    const simResource = new SimGlueTable({
      name: "access_logs",
      databaseName: "site_logs",
      accountRegionScope: new SimAws().accountRegionScope().accountRegionScope,
      createTime: new Date(0),
    });

    // When the adapter is asked for it.
    const adapter = glueValueAdapter({
      logicalId: "LogTable",
      type: "AWS::S3::Bucket",
      simResource,
    });

    // Then it claims nothing, leaving the next adapter to answer.
    assertUndefined(adapter);
  });

  it("claims nothing for a Glue type holding another service's resource", () => {
    // Given a Glue Resource type whose simulated resource is something else,
    // which is what a partly deployed stack looks like.
    const adapter = glueValueAdapter({
      logicalId: "LogTable",
      type: "AWS::Glue::Table",
      simResource: { notATable: true },
    });

    // Then it claims nothing.
    assertUndefined(adapter);
  });
});

describe("SimGlueTableCfn attributes", () => {
  it("refuses an attribute AWS::Glue::Table does not have", () => {
    // Given the value adapter for a table.
    const table = new SimGlueTable({
      name: "access_logs",
      databaseName: "site_logs",
      accountRegionScope: new SimAws().accountRegionScope().accountRegionScope,
      createTime: new Date(0),
    });
    const adapter = new SimGlueTableCfn({ table });

    // When an attribute outside the one CloudFormation documents is read.
    const error = assertThrowsError(() => {
      adapter.attributeValue("Arn");
    });

    // Then it is refused by name.
    assertStringIncludes(error.message, "Unsupported");
    assertStringIncludes(error.message, "Arn");
  });

  it("reads no columns from a table with no storage descriptor", () => {
    // Given a table declared without one.
    const table = new SimGlueTable({
      name: "access_logs",
      databaseName: "site_logs",
      accountRegionScope: new SimAws().accountRegionScope().accountRegionScope,
      createTime: new Date(0),
    });

    // Then it has no columns, rather than failing to answer.
    assertArrayLength(table.columns, 0);
    assertArrayLength(table.partitionKeys, 0);
  });
});

describe("SimGlueCfnResourceFactory", () => {
  it("skips a Glue Resource type it has no creator for", async () => {
    // Given a template declaring a crawler alongside a database, which is a
    // stack half of this simulation can deploy.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "analytics-stack",
      template: {
        Resources: {
          LogDatabase: {
            Type: "AWS::Glue::Database",
            Properties: { DatabaseInput: { Name: "site_logs" } },
          },
          LogCrawler: {
            Type: "AWS::Glue::Crawler",
            Properties: { Name: "site-logs", Role: "crawler" },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the crawler is recorded as skipped and the stack completes anyway,
    // which is the behaviour argued for in #273. The database is there.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertArrayLength(stack.skippedResources, 1);

    const [skipped] = stack.skippedResources;

    assertNonNullable(skipped);
    assertIdentical(skipped.type, "AWS::Glue::Crawler");
    assertNonNullable(simAws.glue().findDatabase("site_logs"));

    await simAws.backgroundTasksComplete();
  });

  it("refuses deleting a Glue Resource type it has no creator for", async () => {
    // Given the factory reached directly, since a skipped Resource never
    // reaches deletion through a stack.
    const factory = new SimAws().glue().cfnResourceFactory();

    // When a type it has no creator for is deleted.
    const error = await assertThrowsErrorAsync(async () => {
      await factory.delete(
        "Crawler",
        { logicalId: "LogCrawler" } as never,
        {} as never,
      );
    });

    // Then it is refused by name, in the wording sim CloudFormation reads as
    // an unsupported Resource rather than a failure.
    assertStringIncludes(error.message, "Unsupported sim Glue CloudFormation");
    assertStringIncludes(error.message, "Crawler");
  });
});

describe("SimGlue command input defaults", () => {
  it("refuses a database created with no DatabaseInput", () => {
    // Given a catalog.
    const glue = new SimAws().glue();

    // When a database is created without the input naming it.
    const error = assertThrowsError(() => {
      glue.createDatabase({ input: {} });
    });

    // Then it is refused, since the name is a database's whole identity.
    assertInstanceOf(error, SimGlueInvalidInputException);
    assertStringIncludes(error.message, "DatabaseInput.Name");
  });

  it("takes a table name from the request when the input carries none", () => {
    // Given a database to put a table in.
    const glue = new SimAws().glue();

    glue.createDatabase({ input: { DatabaseInput: { Name: "site_logs" } } });

    // When a table is created with the name outside its TableInput, which
    // CreateTable also allows.
    glue.createTable({
      input: { DatabaseName: "site_logs", Name: "access_logs" },
    });

    // Then that name is used.
    const { Table } = glue.getTable({
      input: { DatabaseName: "site_logs", Name: "access_logs" },
    });

    assertIdentical(Table.Name, "access_logs");
  });
});

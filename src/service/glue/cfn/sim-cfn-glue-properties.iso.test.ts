import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
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

describe("AWS::Glue::Database properties", () => {
  it("names an unnamed database after the stack and the logical ID", async () => {
    // Given a template whose DatabaseInput carries no name of its own, which
    // real Glue allows since only DatabaseInput itself is required.
    const simAws = new SimAws();

    // When it is deployed.
    await deploy(simAws, {
      LogDatabase: {
        Type: "AWS::Glue::Database",
        Properties: { DatabaseInput: {} },
      },
    });

    // Then the name is built from the stack and the logical ID, lowercased,
    // since Glue names are lowercase for Hive compatibility, and ends in the
    // tail CloudFormation puts on a name it generates.
    const [created] = simAws.glue().allDatabases();

    assertNonNullable(created);
    assertStringStartsWith(created.name, "analytics-stack-logdatabase-");
    assertIdentical(created.name, created.name.toLowerCase());

    await simAws.backgroundTasksComplete();
  });

  it("refuses a database with no DatabaseInput", async () => {
    // Given a template leaving out the property real Glue requires.
    const simAws = new SimAws();

    // When it is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "analytics-stack",
        template: {
          Resources: {
            LogDatabase: { Type: "AWS::Glue::Database", Properties: {} },
          },
        },
      });
    });

    // Then it is refused rather than deployed under a generated name.
    assertStringIncludes(error.message, "DatabaseInput is required");
  });

  it("takes the name from a top-level DatabaseName", async () => {
    // Given a template naming the database outside its DatabaseInput, which
    // AWS::Glue::Database also allows.
    const simAws = new SimAws();

    // When it is deployed.
    await deploy(simAws, {
      LogDatabase: {
        Type: "AWS::Glue::Database",
        Properties: {
          DatabaseName: "site_logs",
          DatabaseInput: { Description: "CloudFront access logs" },
        },
      },
    });

    // Then that name is used.
    assertNonNullable(simAws.glue().findDatabase("site_logs"));

    await simAws.backgroundTasksComplete();
  });

  it("keeps the location and parameters a database declares", async () => {
    // Given a template declaring both.
    const simAws = new SimAws();

    // When it is deployed.
    await deploy(simAws, {
      LogDatabase: {
        Type: "AWS::Glue::Database",
        Properties: {
          DatabaseInput: {
            Name: "site_logs",
            LocationUri: "s3://site-logs/",
            Parameters: { owner: "analytics" },
          },
        },
      },
    });

    // Then both read back.
    const found = simAws.glue().findDatabase("site_logs");

    assertNonNullable(found);
    assertIdentical(found.locationUri, "s3://site-logs/");
    assertIdentical(found.parameters["owner"], "analytics");

    await simAws.backgroundTasksComplete();
  });

  it("records the database properties it is created without", async () => {
    // Given a template declaring a federated database and a Lake Formation
    // grant, neither of which this simulation acts on.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "analytics-stack",
      template: {
        Resources: {
          LogDatabase: {
            Type: "AWS::Glue::Database",
            Properties: {
              Tags: [{ Key: "team", Value: "analytics" }],
              DatabaseInput: {
                Name: "site_logs",
                FederatedDatabase: { Identifier: "elsewhere" },
              },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the database is created, and each unread property is reported.
    assertNonNullable(simAws.glue().findDatabase("site_logs"));

    const paths = stack.ignoredProperties.map((property) => property.path);

    assertArrayLength(paths, 2);
    assertStringIncludes(paths.join(" "), "Tags");
    assertStringIncludes(paths.join(" "), "DatabaseInput.FederatedDatabase");

    await simAws.backgroundTasksComplete();
  });

  it("has no Fn::GetAtt attribute at all", async () => {
    // Given a template reading an attribute off a database.
    const simAws = new SimAws();

    // When it is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "analytics-stack",
        template: {
          Resources: { LogDatabase: database },
          Outputs: {
            Anything: { Value: { "Fn::GetAtt": ["LogDatabase", "Arn"] } },
          },
        },
      });
    });

    // Then it is refused, since CloudFormation gives this type none.
    assertStringIncludes(error.message, "no attributes");

    await simAws.backgroundTasksComplete();
  });
});

import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const outputLocation = "s3://rainlytics-results-888888888888/queries/";

const workGroupTemplate = {
  Resources: {
    RainlyticsQueries: {
      Type: "AWS::Athena::WorkGroup",
      Properties: {
        Name: "rainlytics",
        Description: "CloudFront access log queries",
        WorkGroupConfiguration: {
          BytesScannedCutoffPerQuery: 10_000_000_000,
          EnforceWorkGroupConfiguration: true,
          PublishCloudWatchMetricsEnabled: true,
          ResultConfiguration: { OutputLocation: outputLocation },
        },
      },
    },
  },
  Outputs: {
    WorkGroupRef: { Value: { Ref: "RainlyticsQueries" } },
    WorkGroupCreatedAt: {
      Value: { "Fn::GetAtt": ["RainlyticsQueries", "CreationTime"] },
    },
  },
};

describe("AWS::Athena::WorkGroup", () => {
  it("creates the workgroup a template declares", async () => {
    // Given a template declaring a workgroup with a bytes-scanned cutoff, as
    // an analytics stack organised around not overspending does.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: workGroupTemplate,
    });

    await stack.waitForDeployComplete();

    // Then nothing was skipped, the workgroup is readable through the SDK
    // with the settings the template set, and Ref answers with its name.
    assertArrayLength(stack.skippedResources, 0);

    const read = await simAws
      .athena()
      .getWorkGroup({ input: { WorkGroup: "rainlytics" } });
    const configuration = read.WorkGroup?.Configuration;

    assertNonNullable(configuration);
    assertIdentical(stack.outputs.get("WorkGroupRef")?.value, "rainlytics");
    assertIdentical(configuration.BytesScannedCutoffPerQuery, 10_000_000_000);
    assertTrue(configuration.EnforceWorkGroupConfiguration === true);
    assertTrue(configuration.PublishCloudWatchMetricsEnabled === true);
    assertIdentical(
      configuration.ResultConfiguration?.OutputLocation,
      outputLocation,
    );
    assertIdentical(
      read.WorkGroup?.Description,
      "CloudFront access log queries",
    );

    await simAws.backgroundTasksComplete();
  });

  it("answers Fn::GetAtt CreationTime with when the workgroup was made", async () => {
    // Given the same template deployed.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: workGroupTemplate,
    });

    await stack.waitForDeployComplete();

    // When the CreationTime output is read.
    const createdAt = stack.outputs.get("WorkGroupCreatedAt")?.value;

    // Then it is the workgroup's own instant, as a string.
    const workGroup = simAws.athena().findWorkGroup("rainlytics");

    assertNonNullable(workGroup);
    assertIdentical(createdAt, workGroup.createdAt.toISOString());

    await simAws.backgroundTasksComplete();
  });

  it("names an unnamed workgroup after the stack and logical ID", async () => {
    // Given a template that leaves the name to CloudFormation, which is what
    // a CDK construct with no physical name does.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: {
        Resources: {
          Queries: { Type: "AWS::Athena::WorkGroup", Properties: {} },
        },
        Outputs: { Ref: { Value: { Ref: "Queries" } } },
      },
    });

    // When it is deployed.
    await stack.waitForDeployComplete();

    // Then the workgroup carries a generated name, and Ref answers with it.
    const name = stack.outputs.get("Ref")?.value;

    assertTypeString(name);
    assertStringIncludes(name, "rainlytics-stack");
    assertStringIncludes(name, "Queries");
    assertNonNullable(simAws.athena().findWorkGroup(name));

    await simAws.backgroundTasksComplete();
  });

  it("disables a workgroup the template asks to be disabled", async () => {
    // Given a template creating a workgroup that takes no queries yet.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: {
        Resources: {
          Queries: {
            Type: "AWS::Athena::WorkGroup",
            Properties: { Name: "paused", State: "DISABLED" },
          },
        },
      },
    });

    // When it is deployed.
    await stack.waitForDeployComplete();

    // Then the state reads back, even though CreateWorkGroup has no state
    // field of its own.
    const read = await simAws
      .athena()
      .getWorkGroup({ input: { WorkGroup: "paused" } });

    assertIdentical(read.WorkGroup?.State, "DISABLED");

    await simAws.backgroundTasksComplete();
  });

  it("deletes the workgroup with the stack that made it", async () => {
    // Given a deployed stack holding a workgroup.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rainlytics-stack",
      template: workGroupTemplate,
    });

    await stack.waitForDeployComplete();

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack({ input: { StackName: "rainlytics-stack" } });
    await simAws.backgroundTasksComplete();

    // Then the workgroup went with it.
    assertUndefined(simAws.athena().findWorkGroup("rainlytics"));
  });

  it("fails a workgroup Resource the simulation refuses", async () => {
    // Given two Resources asking for the same workgroup name, which a stack
    // written by hand does.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "rainlytics-stack",
        template: {
          Resources: {
            Queries: {
              Type: "AWS::Athena::WorkGroup",
              Properties: { Name: "rainlytics" },
            },
            QueriesAgain: {
              Type: "AWS::Athena::WorkGroup",
              Properties: { Name: "rainlytics" },
              DependsOn: "Queries",
            },
          },
        },
      });
    });

    // And it names the Resource that was invalid, with Athena's own reason
    // inside it, rather than skipping it and leaving the stack looking
    // deployed with a workgroup missing.
    assertStringIncludes(
      error.message,
      "Invalid AWS::Athena::WorkGroup Resource QueriesAgain",
    );
    assertStringIncludes(error.message, "is already created");

    await simAws.backgroundTasksComplete();
  });
});

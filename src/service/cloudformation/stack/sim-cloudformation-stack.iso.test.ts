import { describe, it } from "vitest";
import { assertIdentical } from "@kensio/smartass";
import { SimAws } from "../../aws/sim-aws.js";

describe("SimCloudFormationStack", () => {
  it("deploys an empty Stack from the default SimAws CloudFormation scope", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();
    const createStackOutput = await cloudFormation.createStack({
      input: {
        StackName: "TestStack",
        TemplateBody: JSON.stringify({}),
      },
    });
    const stack = cloudFormation.stacks.get("TestStack" as never);

    assertIdentical(createStackOutput.StackId, "TestStack");
    assertIdentical(stack?.status, "CREATE_IN_PROGRESS");

    await simAws.backgroundTasksComplete();

    assertIdentical(stack.status, "CREATE_COMPLETE");
  });

  it("deploys a template through SimCloudFormation", async () => {
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      template: {},
    });

    assertIdentical(stack.status, "CREATE_COMPLETE");
  });

  it("deploys a template in a specific Account's default Region scope", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws.account("111111111111").cloudFormation();
    const stack = await cloudFormation.deployTemplate({
      template: {},
    });

    assertIdentical(
      cloudFormation.accountRegionScope.accountId,
      "111111111111",
    );
    assertIdentical(
      cloudFormation.accountRegionScope.regionName,
      simAws.defaultRegionName,
    );
    assertIdentical(stack.status, "CREATE_COMPLETE");
  });

  it("deploys a template in a specific Region scope", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws.region("eu-west-1").cloudFormation();
    const stack = await cloudFormation.deployTemplate({
      template: {},
    });

    assertIdentical(cloudFormation.accountRegionScope.regionName, "eu-west-1");
    assertIdentical(stack.status, "CREATE_COMPLETE");
  });

  it("deploys a template in a specific Account and Region scope", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws
      .account("111111111111")
      .region("ap-southeast-2")
      .cloudFormation();
    const stack = await cloudFormation.deployTemplate({
      template: {},
    });

    assertIdentical(
      cloudFormation.accountRegionScope.accountId,
      "111111111111",
    );
    assertIdentical(
      cloudFormation.accountRegionScope.regionName,
      "ap-southeast-2",
    );
    assertIdentical(stack.status, "CREATE_COMPLETE");
  });
});

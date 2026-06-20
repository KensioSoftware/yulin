import { describe, it } from "vitest";
import {
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimAws } from "../../aws/sim-aws.js";
import { CreateStackCommand } from "@aws-sdk/client-cloudformation";
import { jsonStringify } from "../../../util/type-guard/json.js";

describe("SimCfnStack", () => {
  it("deploys an empty Stack from the default SimAws CloudFormation scope", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();
    const createStackOutput = await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "TestStack",
        TemplateBody: jsonStringify({ Resources: {} }),
      }),
    );
    const stack = cloudFormation.getStackByName("TestStack");

    assertIdentical(createStackOutput.StackId, "TestStack");
    assertIdentical(stack?.lifecycle.status, "CREATE_IN_PROGRESS");

    await simAws.backgroundTasksComplete();

    assertIdentical(stack.lifecycle.status, "CREATE_COMPLETE");
  });

  it("deploys a template through SimCloudFormation", async () => {
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      template: { Resources: {} },
    });

    assertIdentical(stack.lifecycle.status, "CREATE_COMPLETE");
  });

  it("deploys a template through SimCloudFormation with Parameter values", async () => {
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      template: {
        Parameters: {
          BucketName: {
            Type: "String",
            Default: "default-bucket-name",
          },
        },
        Resources: {
          TestBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: {
                Ref: "BucketName",
              },
            },
          },
        },
      },
      parameters: {
        BucketName: "override-bucket-name",
      },
    });

    const resource = stack.resources.get("TestBucket");
    assertNonNullable(resource);
    assertIdentical(resource.properties["BucketName"], "override-bucket-name");
    assertIdentical(stack.lifecycle.status, "CREATE_COMPLETE");
  });

  it("deploys a template in a specific Account's default Region scope", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws.account("111111111111").cloudFormation();
    const stack = await cloudFormation.deployTemplate({
      template: { Resources: {} },
    });

    assertIdentical(
      cloudFormation.accountRegionScope.accountId,
      "111111111111",
    );
    assertIdentical(
      cloudFormation.accountRegionScope.regionName,
      simAws.defaultRegionName,
    );
    assertIdentical(stack.lifecycle.status, "CREATE_COMPLETE");
  });

  it("deploys a template in a specific Region scope", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws.region("eu-west-1").cloudFormation();
    const stack = await cloudFormation.deployTemplate({
      template: { Resources: {} },
    });

    assertIdentical(cloudFormation.accountRegionScope.regionName, "eu-west-1");
    assertIdentical(stack.lifecycle.status, "CREATE_COMPLETE");
  });

  it("deploys a template in a specific Account and Region scope", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws
      .account("111111111111")
      .region("ap-southeast-2")
      .cloudFormation();
    const stack = await cloudFormation.deployTemplate({
      template: { Resources: {} },
    });

    assertIdentical(
      cloudFormation.accountRegionScope.accountId,
      "111111111111",
    );
    assertIdentical(
      cloudFormation.accountRegionScope.regionName,
      "ap-southeast-2",
    );
    assertIdentical(stack.lifecycle.status, "CREATE_COMPLETE");
  });

  it("fails deployment when Resource dependencies cannot be resolved", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();
    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "TestStack",
        TemplateBody: jsonStringify({
          Resources: {
            FirstBucket: {
              Type: "AWS::S3::Bucket",
              DependsOn: "SecondBucket",
            },
            SecondBucket: {
              Type: "AWS::S3::Bucket",
              DependsOn: "FirstBucket",
            },
          },
        }),
      }),
    );

    const stack = cloudFormation.getStackByName("TestStack");
    assertNonNullable(stack);

    await simAws.backgroundTasksComplete();

    assertIdentical(stack.lifecycle.status, "CREATE_FAILED");
    assertNonNullable(stack.lifecycle.error);
    assertIdentical(
      stack.lifecycle.error.message,
      "Could not resolve simulated CloudFormation Resource dependencies in Stack TestStack",
    );
  });

  it("throws when deploy is called while create is in progress", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();
    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "TestStack",
        TemplateBody: jsonStringify({
          Resources: {
            TestBucket: {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: "test-bucket",
              },
            },
          },
        }),
      }),
    );

    const stack = cloudFormation.getStackByName("TestStack");
    assertNonNullable(stack);
    assertIdentical(stack.lifecycle.status, "CREATE_IN_PROGRESS");

    const error = await assertThrowsErrorAsync(async () => {
      await stack.deploy();
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack cannot be deployed from CREATE_IN_PROGRESS status",
    );

    await simAws.backgroundTasksComplete();

    assertIdentical(stack.lifecycle.status, "CREATE_COMPLETE");
  });
});

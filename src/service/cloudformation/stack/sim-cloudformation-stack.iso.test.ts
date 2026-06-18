import { describe, it } from "vitest";
import {
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCloudFormationStackName } from "./sim-cloudformation-stack.js";

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

  it("fails deployment when Resource dependencies cannot be resolved", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();
    await cloudFormation.createStack({
      input: {
        StackName: "TestStack",
        TemplateBody: JSON.stringify({
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
      },
    });

    const stack = cloudFormation.stacks.get("TestStack" as never);
    assertNonNullable(stack);

    await simAws.backgroundTasksComplete();

    assertIdentical(stack.status, "CREATE_FAILED");
    assertNonNullable(stack.error);
    assertIdentical(
      stack.error.message,
      "Could not resolve simulated CloudFormation Resource dependencies in Stack TestStack",
    );
  });

  it("throws when deploy is called while create is in progress", async () => {
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();
    await cloudFormation.createStack({
      input: {
        StackName: "TestStack",
        TemplateBody: JSON.stringify({
          Resources: {
            TestBucket: {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: "test-bucket",
              },
            },
          },
        }),
      },
    });

    const stack = cloudFormation.stacks.get("TestStack" as never);
    assertNonNullable(stack);
    assertIdentical(stack.status, "CREATE_IN_PROGRESS");

    const error = await assertThrowsErrorAsync(async () => {
      await stack.deploy();
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack cannot be deployed from CREATE_IN_PROGRESS status",
    );

    await simAws.backgroundTasksComplete();

    assertIdentical(stack.status, "CREATE_COMPLETE");
  });

  it("resolves CloudFormation Parameter default values in Resource templates", async () => {
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
    });
    const resource = stack.resources.get("TestBucket");

    assertNonNullable(resource);
    assertIdentical(resource.properties["BucketName"], "default-bucket-name");
    assertIdentical(stack.status, "CREATE_COMPLETE");
  });

  it("resolves CreateStack Parameter values in Resource templates", async () => {
    const simAws = new SimAws();

    const stackName = "TestStack" as SimCloudFormationStackName;

    const cloudFormation = simAws.cloudFormation();
    await cloudFormation.createStack({
      input: {
        StackName: stackName,
        TemplateBody: JSON.stringify({
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
        }),
        Parameters: [
          {
            ParameterKey: "BucketName",
            ParameterValue: "override-bucket-name",
          },
        ],
      },
    });

    await simAws.backgroundTasksComplete();

    const stack = cloudFormation.stacks.get(stackName);
    assertNonNullable(stack);

    const resource = stack.resources.get("TestBucket");
    assertNonNullable(resource);

    assertIdentical(resource.properties["BucketName"], "override-bucket-name");
    assertIdentical(stack.status, "CREATE_COMPLETE");
  });

  it("resolves deployTemplate Parameter values in Resource templates", async () => {
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      template: {
        Parameters: {
          BucketName: {
            Type: "String",
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
        BucketName: "deploy-template-bucket-name",
      },
    });
    const resource = stack.resources.get("TestBucket");

    assertNonNullable(resource);
    assertIdentical(
      resource.properties["BucketName"],
      "deploy-template-bucket-name",
    );
    assertIdentical(stack.status, "CREATE_COMPLETE");
  });

  it("resolves CloudFormation Parameter refs recursively in Resource templates", async () => {
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      template: {
        Parameters: {
          FirstValue: {
            Type: "String",
            Default: "first",
          },
          SecondValue: {
            Type: "String",
            Default: "second",
          },
        },
        Resources: {
          TestResource: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            Properties: {
              Nested: {
                Values: [
                  {
                    Ref: "FirstValue",
                  },
                  {
                    Ref: "SecondValue",
                  },
                ],
              },
            },
          },
        },
      },
    });
    const resource = stack.resources.get("TestResource");

    assertNonNullable(resource);

    const nested = resource.properties["Nested"] as Record<string, unknown>;
    const values = nested["Values"] as unknown[];

    assertIdentical(values[0], "first");
    assertIdentical(values[1], "second");
    assertIdentical(stack.status, "CREATE_COMPLETE");
  });

  it("fails deployment when a referenced CloudFormation Parameter has no value", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "TestStack",
        template: {
          Parameters: {
            BucketName: {
              Type: "String",
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
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack parameter BucketName is missing a value",
    );
  });

  it("fails deployment when a CloudFormation Parameter definition is not an object", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "TestStack",
        template: {
          Parameters: {
            BucketName: "not-a-parameter-definition",
          },
          Resources: {
            TestBucket: {
              Type: "AWS::S3::Bucket",
            },
          },
        },
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack parameter BucketName definition must be an object",
    );
  });

  it("fails deployment when CloudFormation Parameters is not an object", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "TestStack",
        template: {
          Parameters: ["not", "a", "parameters", "object"],
          Resources: {
            TestBucket: {
              Type: "AWS::S3::Bucket",
            },
          },
        },
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack Parameters must be an object",
    );
  });
});

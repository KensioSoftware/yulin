import { describe, it } from "vitest";
import {
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { SimAws } from "../../../aws/sim-aws.js";

/* oxlint-disable no-template-curly-in-string */

describe("sim CloudFormation Stack Outputs", () => {
  it("resolves stack Outputs after deployment", async () => {
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "TestStack",
      template: {
        Resources: {
          SiteBucket397A1860: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "site-bucket",
            },
          },
        },
        Outputs: {
          SiteBucketName: {
            Value: {
              Ref: "SiteBucket397A1860",
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    assertIdentical(stack.outputs.get("SiteBucketName")?.value, "site-bucket");
  });

  it("resolves Outputs from Resources created through dependency chains", async () => {
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "OutputDependencyStack",
      template: {
        Resources: {
          SourceBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "source-output-bucket",
            },
          },
          DerivedFunction: {
            Type: "AWS::CloudFront::Function",
            DependsOn: "SourceBucket",
            Properties: {
              Name: {
                "Fn::Join": [
                  "-",
                  [
                    {
                      Ref: "SourceBucket",
                    },
                    "derived-function",
                  ],
                ],
              },
              FunctionConfig: {
                Comment: {
                  "Fn::Sub": "Depends on ${SourceBucket}",
                },
                Runtime: "cloudfront-js-2.0",
              },
              FunctionCode: `
function handler(event) {
  return event.request;
}
`,
            },
          },
        },
        Outputs: {
          SourceBucketName: {
            Value: {
              Ref: "SourceBucket",
            },
          },
          DerivedFunctionName: {
            Value: {
              Ref: "DerivedFunction",
            },
          },
          DependencySummary: {
            Value: {
              "Fn::Sub": "${SourceBucket} -> ${DerivedFunction}",
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    assertIdentical(
      stack.outputs.get("SourceBucketName")?.value,
      "source-output-bucket",
    );
    assertIdentical(
      stack.outputs.get("DerivedFunctionName")?.value,
      "source-output-bucket-derived-function",
    );
    assertIdentical(
      stack.outputs.get("DependencySummary")?.value,
      "source-output-bucket -> source-output-bucket-derived-function",
    );
  });

  it("exposes resolved Outputs through DescribeStacks", async () => {
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.deployTemplate({
      stackName: "DescribeOutputStack",
      template: {
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "describe-output-bucket",
            },
          },
        },
        Outputs: {
          SiteBucketName: {
            Description: "The simulated site bucket name",
            Value: {
              Ref: "SiteBucket",
            },
          },
        },
      },
    });

    const result = await cloudFormation.describeStacks(
      new DescribeStacksCommand({
        StackName: "DescribeOutputStack",
      }),
    );
    const describedStack = result.Stacks?.[0];
    const output = describedStack?.Outputs?.find(
      (item) => item.OutputKey === "SiteBucketName",
    );

    assertNonNullable(output);
    assertIdentical(output.OutputKey, "SiteBucketName");
    assertIdentical(output.OutputValue, "describe-output-bucket");
    assertIdentical(output.Description, "The simulated site bucket name");
  });

  it("resolves Output Export names", async () => {
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    const stack = await cloudFormation.deployTemplate({
      stackName: "ExportOutputStack",
      template: {
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "export-output-bucket",
            },
          },
        },
        Outputs: {
          SiteBucketName: {
            Value: {
              Ref: "SiteBucket",
            },
            Export: {
              Name: {
                "Fn::Join": [
                  "-",
                  [
                    {
                      Ref: "SiteBucket",
                    },
                    "SiteBucketName",
                  ],
                ],
              },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    assertIdentical(
      stack.outputs.get("SiteBucketName")?.exportName,
      "export-output-bucket-SiteBucketName",
    );

    const result = await cloudFormation.describeStacks(
      new DescribeStacksCommand({
        StackName: "ExportOutputStack",
      }),
    );
    const describedStack = result.Stacks?.[0];
    const output = describedStack?.Outputs?.find(
      (item) => item.OutputKey === "SiteBucketName",
    );

    assertNonNullable(output);
    assertIdentical(output.OutputValue, "export-output-bucket");
    assertIdentical(output.ExportName, "export-output-bucket-SiteBucketName");
  });

  it("fails deployment when an Output has no Value", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "InvalidOutputStack",
        template: {
          Resources: {},
          Outputs: {
            MissingValue: {
              Description: "No Value field",
            },
          },
        },
      }),
    );

    assertIdentical(
      error.message,
      "Sim CloudFormation Output MissingValue must have a Value",
    );
  });
});

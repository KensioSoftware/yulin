import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../../aws/sim-aws.js";

/* eslint-disable no-template-curly-in-string */

describe("CloudFormation Fn::Sub literals", () => {
  it("substitutes explicit variable values", async () => {
    const subTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Sub": [
                "${Prefix}-${Name}",
                {
                  Prefix: "my",
                  Name: "bucket",
                },
              ],
            },
          },
        },
      },
    };

    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: subTemplate,
    });

    const bucket = simAws.s3().getSimBucketByName("my-bucket");

    assertNonNullable(bucket);
    assertIdentical(bucket.bucketName, "my-bucket");
  });

  it("substitutes explicit variable values that contain Parameter Refs", async () => {
    const subTemplate = {
      Parameters: {
        Environment: {
          Type: "String",
          Default: "dev",
        },
      },
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Sub": [
                "my-${EnvName}-bucket",
                {
                  EnvName: {
                    Ref: "Environment",
                  },
                },
              ],
            },
          },
        },
      },
    };

    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: subTemplate,
    });

    const bucket = simAws.s3().getSimBucketByName("my-dev-bucket");

    assertNonNullable(bucket);
    assertIdentical(bucket.bucketName, "my-dev-bucket");
  });

  it("keeps escaped substitutions literal", async () => {
    const subTemplate = {
      Resources: {
        WaitHandle: {
          Type: "AWS::CloudFormation::WaitConditionHandle",
          Properties: {
            Value: {
              "Fn::Sub": "literal-${!Name}",
            },
          },
        },
      },
    };

    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: subTemplate,
    });

    const resource = stack.resources.get("WaitHandle");

    assertNonNullable(resource);
    assertIdentical(resource.status, "CREATE_COMPLETE");
    assertIdentical(resource.properties["Value"], "literal-${Name}");
  });

  it("throws when an Fn::Sub variable does not resolve to a string", async () => {
    const invalidSubTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Sub": [
                "my-${Name}-bucket",
                {
                  Name: 123,
                },
              ],
            },
          },
        },
      },
    };

    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "test-stack",
        template: invalidSubTemplate,
      }),
    );

    assertInstanceOf(error, TypeError);
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.BucketName: " +
        "Sim CloudFormation Fn::Sub variable Name must resolve to a string, got number",
    );
  });
});

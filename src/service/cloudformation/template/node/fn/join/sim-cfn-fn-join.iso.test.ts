import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../../aws/sim-aws.js";
import { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";

describe("CloudFormation Fn::Join Resource value", () => {
  it("joins literal string values with the delimiter to name an S3 Bucket", async () => {
    // Given a CloudFormation template that builds a Bucket name with Fn::Join.
    const joinTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Join": ["-", ["my", "test", "bucket"]],
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: joinTemplate,
    });

    // Then the Bucket is created using the joined name.
    const bucket = simAws.s3().getSimBucketByName("my-test-bucket");

    assertNonNullable(bucket);
    assertInstanceOf(bucket, SimS3Bucket);
    assertIdentical(bucket.bucketName, "my-test-bucket");

    const resource = stack.getResource("TestBucket");

    assertNonNullable(resource);
    assertIdentical(resource.status, "CREATE_COMPLETE");
    assertIdentical(resource.simResource, bucket);
  });

  it("joins values with an empty delimiter", async () => {
    // Given a template that concatenates values with an empty delimiter.
    const joinTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Join": ["", ["my", "bucket", "name"]],
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: joinTemplate,
    });

    // Then the Bucket name is the concatenation of the values.
    const bucket = simAws.s3().getSimBucketByName("mybucketname");

    assertNonNullable(bucket);
    assertInstanceOf(bucket, SimS3Bucket);
    assertIdentical(bucket.bucketName, "mybucketname");
  });

  it("resolves a single value with no delimiter applied", async () => {
    // Given a template that joins a single value.
    const joinTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Join": ["-", ["only-value"]],
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: joinTemplate,
    });

    // Then the joined name is just the single value.
    const bucket = simAws.s3().getSimBucketByName("only-value");

    assertNonNullable(bucket);
    assertIdentical(bucket.bucketName, "only-value");
  });

  it("joins literal values with a resolved Parameter Ref", async () => {
    // Given a template that combines Fn::Join with a Ref to a Parameter.
    const joinReferenceTemplate = {
      Parameters: {
        Environment: {
          Type: "String",
        },
      },
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Join": ["-", ["my", { Ref: "Environment" }, "bucket"]],
            },
          },
        },
      },
    };

    // When the template is deployed with an Environment Parameter value.
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: joinReferenceTemplate,
      parameters: {
        Environment: "prod",
      },
    });

    // Then the Ref value is resolved and joined into the Bucket name.
    const bucket = simAws.s3().getSimBucketByName("my-prod-bucket");

    assertNonNullable(bucket);
    assertInstanceOf(bucket, SimS3Bucket);
    assertIdentical(bucket.bucketName, "my-prod-bucket");
  });

  it("resolves a Ref to a Parameter default value inside Fn::Join", async () => {
    // Given a template that joins with a Ref to a Parameter that has a default.
    const joinDefaultTemplate = {
      Parameters: {
        Suffix: {
          Type: "String",
          Default: "default",
        },
      },
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Join": ["-", ["bucket", { Ref: "Suffix" }]],
            },
          },
        },
      },
    };

    // When the template is deployed without an explicit Parameter value.
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: joinDefaultTemplate,
    });

    // Then the Parameter default is resolved and joined into the name.
    const bucket = simAws.s3().getSimBucketByName("bucket-default");

    assertNonNullable(bucket);
    assertIdentical(bucket.bucketName, "bucket-default");
  });

  it("resolves a Fn::Join value on a WaitConditionHandle Resource property", async () => {
    // Given a template using Fn::Join on a WaitConditionHandle Resource property.
    const joinTemplate = {
      Parameters: {
        Name: {
          Type: "String",
          Default: "handle",
        },
      },
      Resources: {
        WaitHandle: {
          Type: "AWS::CloudFormation::WaitConditionHandle",
          Properties: {
            JoinedValue: {
              "Fn::Join": ["/", ["prefix", { Ref: "Name" }, "suffix"]],
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: joinTemplate,
    });

    // Then the Resource is created with the Fn::Join value already resolved.
    const resource = stack.getResource("WaitHandle");

    assertNonNullable(resource);
    assertIdentical(resource.status, "CREATE_COMPLETE");
    assertIdentical(resource.properties["JoinedValue"], "prefix/handle/suffix");
  });

  it("throws when an Fn::Join value does not resolve to a string", async () => {
    // Given a template whose Fn::Join contains a non-string value.
    const invalidJoinTemplate = {
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Join": ["-", ["my", 123, "bucket"]],
            },
          },
        },
      },
    };

    // When the template is deployed, then deployment fails with a clear error.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "test-stack",
        template: invalidJoinTemplate,
      }),
    );

    assertInstanceOf(error, TypeError);
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestBucket value at Properties.BucketName: " +
        "Sim CloudFormation Fn::Join values must each resolve to a string, got number",
    );
  });
});

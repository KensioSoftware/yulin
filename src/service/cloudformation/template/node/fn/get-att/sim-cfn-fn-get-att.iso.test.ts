import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../../aws/sim-aws.js";
import { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";

describe("CloudFormation Fn::GetAtt Resource value", () => {
  it("resolves a Resource GetAtt inside Fn::Join when creating another Resource", async () => {
    // Given a template where one Bucket name is built from a GetAtt to another
    // S3 Bucket Resource.
    const getAttJoinTemplate = {
      Resources: {
        SourceBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "source-bucket",
          },
        },
        DerivedBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Join": [
                "-",
                [{ "Fn::GetAtt": ["SourceBucket", "foo"] }, "derived"],
              ],
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: getAttJoinTemplate,
    });

    // Then the GetAtt resolves during creation of the derived Bucket.
    const sourceBucket = simAws.s3().getSimBucketByName("source-bucket");
    const derivedBucket = simAws
      .s3()
      .getSimBucketByName("source-bucket.foo-derived");

    assertNonNullable(sourceBucket);
    assertNonNullable(derivedBucket);
    assertInstanceOf(sourceBucket, SimS3Bucket);
    assertInstanceOf(derivedBucket, SimS3Bucket);
    assertIdentical(sourceBucket.bucketName, "source-bucket");
    assertIdentical(derivedBucket.bucketName, "source-bucket.foo-derived");

    const sourceResource = stack.resources.get("SourceBucket");
    const derivedResource = stack.resources.get("DerivedBucket");

    assertNonNullable(sourceResource);
    assertNonNullable(derivedResource);
    assertIdentical(sourceResource.status, "CREATE_COMPLETE");
    assertIdentical(derivedResource.status, "CREATE_COMPLETE");
    assertIdentical(sourceResource.simResource, sourceBucket);
    assertIdentical(derivedResource.simResource, derivedBucket);
  });

  it("supports the dotted string Fn::GetAtt form", async () => {
    // Given a template using the CloudFormation dotted string GetAtt form.
    const dottedGetAttTemplate = {
      Resources: {
        SourceBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "source-bucket",
          },
        },
        DerivedBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Join": [
                "-",
                [{ "Fn::GetAtt": "SourceBucket.foo" }, "derived"],
              ],
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: dottedGetAttTemplate,
    });

    // Then the dotted GetAtt resolves the same as the array form.
    const derivedBucket = simAws
      .s3()
      .getSimBucketByName("source-bucket.foo-derived");

    assertNonNullable(derivedBucket);
    assertInstanceOf(derivedBucket, SimS3Bucket);
    assertIdentical(derivedBucket.bucketName, "source-bucket.foo-derived");
  });

  it("creates implicit Resource dependencies from Fn::GetAtt", async () => {
    // Given a dependent Resource declared before the Resource from which it
    // gets an attribute.
    const dependencyTemplate = {
      Resources: {
        DerivedBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Join": [
                "-",
                [{ "Fn::GetAtt": ["SourceBucket", "foo"] }, "derived"],
              ],
            },
          },
        },
        SourceBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "source-bucket",
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: dependencyTemplate,
    });

    // Then dependency discovery waits for SourceBucket before DerivedBucket.
    const sourceResource = stack.resources.get("SourceBucket");
    const derivedResource = stack.resources.get("DerivedBucket");
    const derivedBucket = simAws
      .s3()
      .getSimBucketByName("source-bucket.foo-derived");

    assertNonNullable(sourceResource);
    assertNonNullable(derivedResource);
    assertNonNullable(derivedBucket);
    assertIdentical(sourceResource.status, "CREATE_COMPLETE");
    assertIdentical(derivedResource.status, "CREATE_COMPLETE");
  });
});

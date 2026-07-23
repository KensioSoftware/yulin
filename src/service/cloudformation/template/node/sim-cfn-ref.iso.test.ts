import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFormationWaitConditionHandle } from "../../resource/factory/sim-cfn-cfn-resource-factory.js";
import { SimS3Bucket } from "../../../s3/bucket/sim-s3-bucket.js";

describe("CloudFormation Ref Resource value", () => {
  it("preserves an S3 Bucket Resource Ref in stored Resource properties", async () => {
    // Given a template where a WaitConditionHandle property Refs an S3 Bucket.
    const referenceTemplate = {
      Resources: {
        SourceBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "source-bucket",
          },
        },
        WaitHandle: {
          Type: "AWS::CloudFormation::WaitConditionHandle",
          Properties: {
            BucketName: {
              Ref: "SourceBucket",
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: referenceTemplate,
    });

    // Then both Resources are created successfully.
    const bucket = simAws.s3().getSimBucketByName("source-bucket");

    assertNonNullable(bucket);
    assertInstanceOf(bucket, SimS3Bucket);
    assertIdentical(bucket.bucketName, "source-bucket");

    const sourceResource = stack.resources.get("SourceBucket");
    const waitHandleResource = stack.resources.get("WaitHandle");

    assertNonNullable(sourceResource);
    assertNonNullable(waitHandleResource);
    assertIdentical(sourceResource.status, "CREATE_COMPLETE");
    assertIdentical(waitHandleResource.status, "CREATE_COMPLETE");
    assertIdentical(sourceResource.simResource, bucket);
    assertInstanceOf(
      waitHandleResource.simResource,
      SimCloudFormationWaitConditionHandle,
    );

    // Stored Resource properties represent the template-facing Resource shape, not
    // an externally observable CloudFormation runtime property bag.
    assertObjectMatches(waitHandleResource.properties["BucketName"], {
      Ref: "SourceBucket",
    });
  });

  it("resolves a Resource Ref inside Fn::Join when creating another Resource", async () => {
    // Given a template where one S3 Bucket name is built from a Ref to another
    // S3 Bucket Resource.
    const referenceJoinTemplate = {
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
              "Fn::Join": ["-", [{ Ref: "SourceBucket" }, "derived"]],
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: referenceJoinTemplate,
    });

    // Then the Resource Ref resolves to the source Bucket name during creation of
    // the derived Bucket.
    const sourceBucket = simAws.s3().getSimBucketByName("source-bucket");
    const derivedBucket = simAws
      .s3()
      .getSimBucketByName("source-bucket-derived");

    assertNonNullable(sourceBucket);
    assertNonNullable(derivedBucket);
    assertInstanceOf(sourceBucket, SimS3Bucket);
    assertInstanceOf(derivedBucket, SimS3Bucket);
    assertIdentical(sourceBucket.bucketName, "source-bucket");
    assertIdentical(derivedBucket.bucketName, "source-bucket-derived");

    const sourceResource = stack.resources.get("SourceBucket");
    const derivedResource = stack.resources.get("DerivedBucket");

    assertNonNullable(sourceResource);
    assertNonNullable(derivedResource);
    assertIdentical(sourceResource.status, "CREATE_COMPLETE");
    assertIdentical(derivedResource.status, "CREATE_COMPLETE");
    assertIdentical(sourceResource.simResource, sourceBucket);
    assertIdentical(derivedResource.simResource, derivedBucket);
  });

  it("resolves Parameter and Resource Refs together inside Fn::Join", async () => {
    // Given a template where a Bucket name combines an up-front Parameter Ref
    // with a Resource Ref that must be deferred until Resource creation.
    const mixedReferenceJoinTemplate = {
      Parameters: {
        BucketPrefix: {
          Type: "String",
        },
      },
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
                [{ Ref: "BucketPrefix" }, { Ref: "SourceBucket" }, "derived"],
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
      template: mixedReferenceJoinTemplate,
      parameters: {
        BucketPrefix: "prefix",
      },
    });

    // Then the Parameter Ref resolves during template processing, while the
    // Resource Ref resolves during creation of the derived Bucket.
    const sourceBucket = simAws.s3().getSimBucketByName("source-bucket");
    const derivedBucket = simAws
      .s3()
      .getSimBucketByName("prefix-source-bucket-derived");

    assertNonNullable(sourceBucket);
    assertNonNullable(derivedBucket);
    assertInstanceOf(sourceBucket, SimS3Bucket);
    assertInstanceOf(derivedBucket, SimS3Bucket);
    assertIdentical(sourceBucket.bucketName, "source-bucket");
    assertIdentical(derivedBucket.bucketName, "prefix-source-bucket-derived");

    const sourceResource = stack.resources.get("SourceBucket");
    const derivedResource = stack.resources.get("DerivedBucket");

    assertNonNullable(sourceResource);
    assertNonNullable(derivedResource);
    assertIdentical(sourceResource.status, "CREATE_COMPLETE");
    assertIdentical(derivedResource.status, "CREATE_COMPLETE");
    assertIdentical(sourceResource.simResource, sourceBucket);
    assertIdentical(derivedResource.simResource, derivedBucket);
  });

  it("resolves multiple Resource Refs inside the same Fn::Join", async () => {
    // Given a template where one Bucket name depends on multiple Resource Refs.
    const multipleResourceReferenceJoinTemplate = {
      Resources: {
        FirstBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "bucket-a",
          },
        },
        SecondBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: { "Fn::Join": ["-", [{ Ref: "FirstBucket" }, "b"]] },
          },
        },
        CombinedBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Join": [
                "-",
                [{ Ref: "FirstBucket" }, { Ref: "SecondBucket" }],
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
      template: multipleResourceReferenceJoinTemplate,
    });

    // Then both Resource Refs resolve before the dependent Bucket is created.
    const firstBucket = simAws.s3().getSimBucketByName("bucket-a");
    const secondBucket = simAws.s3().getSimBucketByName("bucket-a-b");
    const combinedBucket = simAws
      .s3()
      .getSimBucketByName("bucket-a-bucket-a-b");

    assertNonNullable(firstBucket);
    assertNonNullable(secondBucket);
    assertNonNullable(combinedBucket);
    assertInstanceOf(firstBucket, SimS3Bucket);
    assertInstanceOf(secondBucket, SimS3Bucket);
    assertInstanceOf(combinedBucket, SimS3Bucket);
    assertIdentical(firstBucket.bucketName, "bucket-a");
    assertIdentical(secondBucket.bucketName, "bucket-a-b");
    assertIdentical(combinedBucket.bucketName, "bucket-a-bucket-a-b");

    const firstResource = stack.resources.get("FirstBucket");
    const secondResource = stack.resources.get("SecondBucket");
    const combinedResource = stack.resources.get("CombinedBucket");

    assertNonNullable(firstResource);
    assertNonNullable(secondResource);
    assertNonNullable(combinedResource);
    assertIdentical(firstResource.status, "CREATE_COMPLETE");
    assertIdentical(secondResource.status, "CREATE_COMPLETE");
    assertIdentical(combinedResource.status, "CREATE_COMPLETE");
    assertIdentical(firstResource.simResource, firstBucket);
    assertIdentical(secondResource.simResource, secondBucket);
    assertIdentical(combinedResource.simResource, combinedBucket);
  });
});

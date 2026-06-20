import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3Bucket } from "../../../s3/bucket/sim-s3-bucket.js";
import { SimCloudFormationWaitConditionHandle } from "../factory/sim-cfn-cfn-resource-factory.js";

describe("CloudFormation Resource Ref value", () => {
  it("uses a created sim Resource refValue() when the Resource provides one", async () => {
    // Given a template where one Bucket name Refs another S3 Bucket Resource.
    const template = {
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
              "Fn::Join": ["-", ["derived", "from", { Ref: "SourceBucket" }]],
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template,
    });

    // Then Ref resolves via the S3 Bucket sim Resource's service-specific
    // refValue(), so the derived Bucket name is based on the source Bucket
    // name.
    const sourceBucket = simAws.s3().getSimBucketByName("source-bucket");
    const sourceResource = stack.resources.get("SourceBucket");
    const derivedResource = stack.resources.get("DerivedBucket");

    assertNonNullable(sourceBucket);
    assertInstanceOf(sourceBucket, SimS3Bucket);
    assertNonNullable(sourceResource);
    assertNonNullable(derivedResource);
    assertIdentical(sourceResource.refValue, "source-bucket");
    assertIdentical(derivedResource.refValue, "derived-from-source-bucket");
  });

  it("falls back to the Resource logical ID when the created sim Resource has no refValue()", async () => {
    // Given a template where an S3 Bucket name Refs a CloudFormation Resource
    // whose created sim Resource does not provide a service-specific Ref value.
    const template = {
      Resources: {
        handle: {
          Type: "AWS::CloudFormation::WaitConditionHandle",
        },
        bucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              Ref: "handle",
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template,
    });

    // Then Ref resolves to the logical ID fallback.
    const bucket = simAws.s3().getSimBucketByName("handle");
    const handleResource = stack.resources.get("handle");
    const bucketResource = stack.resources.get("bucket");

    assertNonNullable(bucket);
    assertInstanceOf(bucket, SimS3Bucket);
    assertIdentical(bucket.bucketName, "handle");

    assertNonNullable(handleResource);
    assertNonNullable(bucketResource);
    assertIdentical(handleResource.status, "CREATE_COMPLETE");
    assertIdentical(bucketResource.status, "CREATE_COMPLETE");
    assertInstanceOf(
      handleResource.simResource,
      SimCloudFormationWaitConditionHandle,
    );
    assertIdentical(handleResource.refValue, "handle");
    assertIdentical(bucketResource.simResource, bucket);
  });

  it("uses the logical ID fallback inside Fn::Join when the created sim Resource has no refValue()", async () => {
    // Given a template where a Bucket name is built from a Ref to a Resource
    // whose created sim Resource does not provide refValue().
    const template = {
      Resources: {
        handle: {
          Type: "AWS::CloudFormation::WaitConditionHandle",
        },
        bucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Join": ["-", [{ Ref: "handle" }, "bucket"]],
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template,
    });

    // Then the Resource Ref contributes the logical ID fallback to the joined value.
    const bucket = simAws.s3().getSimBucketByName("handle-bucket");
    const handleResource = stack.resources.get("handle");
    const bucketResource = stack.resources.get("bucket");

    assertNonNullable(bucket);
    assertInstanceOf(bucket, SimS3Bucket);
    assertIdentical(bucket.bucketName, "handle-bucket");

    assertNonNullable(handleResource);
    assertNonNullable(bucketResource);
    assertIdentical(handleResource.refValue, "handle");
    assertIdentical(bucketResource.simResource, bucket);
  });
});

import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../../aws/sim-aws.js";
import { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";

/* eslint-disable no-template-curly-in-string */

describe("CloudFormation Fn::Sub Resource referential", () => {
  it("substitutes a Parameter Ref in a string to name an S3 Bucket", async () => {
    const subTemplate = {
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
              "Fn::Sub": "my-${Environment}-bucket",
            },
          },
        },
      },
    };

    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: subTemplate,
      parameters: {
        Environment: "prod",
      },
    });

    const bucket = simAws.s3().getSimBucketByName("my-prod-bucket");

    assertNonNullable(bucket);
    assertInstanceOf(bucket, SimS3Bucket);
    assertIdentical(bucket.bucketName, "my-prod-bucket");

    const resource = stack.resources.get("TestBucket");

    assertNonNullable(resource);
    assertIdentical(resource.status, "CREATE_COMPLETE");
    assertIdentical(resource.simResource, bucket);
  });

  it("resolves a Resource Ref inside Fn::Sub when creating another Resource", async () => {
    // Given a template where one S3 Bucket name is built from a Fn::Sub reference
    // to another S3 Bucket Resource.
    const subReferenceTemplate = {
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
              "Fn::Sub": "${SourceBucket}-derived",
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: subReferenceTemplate,
    });

    // Then the Resource Ref is deferred during template parsing and resolved
    // during creation of the derived Bucket.
    const sourceBucket = simAws.s3().getSimBucketByName("source-bucket");
    const derivedBucket = simAws
      .s3()
      .getSimBucketByName("source-bucket-derived");

    assertInstanceOf(sourceBucket, SimS3Bucket);
    assertInstanceOf(derivedBucket, SimS3Bucket);
    assertIdentical(sourceBucket.bucketName, "source-bucket");
    assertIdentical(derivedBucket.bucketName, "source-bucket-derived");

    const sourceResource = stack.resources.get("SourceBucket");
    const derivedResource = stack.resources.get("DerivedBucket");

    assertIdentical(sourceResource?.status, "CREATE_COMPLETE");
    assertIdentical(derivedResource?.status, "CREATE_COMPLETE");
    assertIdentical(sourceResource.simResource, sourceBucket);
    assertIdentical(derivedResource.simResource, derivedBucket);
  });

  it("resolves a Resource Ref from an explicit Fn::Sub variable map", async () => {
    // Given a template where Fn::Sub's template variable is an alias, and the
    // explicit variable map contains the actual Resource Ref dependency.
    const subReferenceTemplate = {
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
              "Fn::Sub": [
                "${BucketName}-derived",
                {
                  BucketName: {
                    Ref: "SourceBucket",
                  },
                },
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
      template: subReferenceTemplate,
    });

    // Then the explicit variable Ref is discovered as a dependency and resolves
    // during creation of the derived Bucket.
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

  it("resolves a Resource attribute reference inside Fn::Sub", async () => {
    // Given a template where Fn::Sub references a Resource attribute using
    // ${LogicalId.AttributeName} syntax.
    const subGetAttTemplate = {
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
              "Fn::Sub": "${SourceBucket.foo}-derived",
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: subGetAttTemplate,
    });

    // Then the dotted Fn::Sub variable is resolved as a Resource attribute when
    // creating the derived Bucket.
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

  it("throws when an explicit Fn::Sub variable is not resolved while preserving an unresolved Resource Ref", async () => {
    // Given a template where Fn::Sub has a deferred Resource Ref and an explicit
    // variable map entry that is not used by the template string.
    const invalidSubTemplate = {
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
              "Fn::Sub": [
                "${SourceBucket}-derived",
                {
                  UnusedName: "unused",
                },
              ],
            },
          },
        },
      },
    };

    // When the template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "test-stack",
        template: invalidSubTemplate,
      }),
    );

    // Then preserving the unresolved Fn::Sub fails on the unused explicit variable.
    assertInstanceOf(error, Error);
    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::Sub variable UnusedName was not resolved",
    );
  });

  it("throws when a dotted Fn::Sub variable has an empty logical ID", async () => {
    const invalidSubTemplate = {
      Resources: {
        DerivedBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: {
              "Fn::Sub": "${.AttributeName}",
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

    assertInstanceOf(error, Error);
    assertIdentical(
      error.message,
      "Logical ID in CFN Fn::Sub variable .AttributeName must be non-empty",
    );
  });
});

import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../../aws/sim-aws.js";
import { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";

describe("CloudFormation Fn::GetAtt parser", () => {
  it("parses array-form Fn::GetAtt in a deployed template", async () => {
    // Given a realistic template where one Resource property uses array-form
    // Fn::GetAtt to depend on another Resource.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: {
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
      },
    });

    // Then the parser accepts the array shape, dependency discovery orders the
    // Resources correctly, and Resource creation resolves the attribute value.
    const sourceBucket = simAws.s3().getSimBucketByName("source-bucket");
    const derivedBucket = simAws
      .s3()
      .getSimBucketByName("source-bucket.foo-derived");

    assertInstanceOf(sourceBucket, SimS3Bucket);
    assertInstanceOf(derivedBucket, SimS3Bucket);
    assertIdentical(sourceBucket.bucketName, "source-bucket");
    assertIdentical(derivedBucket.bucketName, "source-bucket.foo-derived");

    const sourceResource = stack.resources.get("SourceBucket");
    const derivedResource = stack.resources.get("DerivedBucket");

    assertNonNullable(sourceResource);
    assertNonNullable(derivedResource);
    assertIdentical(sourceResource.simResource, sourceBucket);
    assertIdentical(derivedResource.simResource, derivedBucket);
  });

  it("parses dotted-string Fn::GetAtt in a deployed template", async () => {
    // Given a realistic template using the alternative dotted-string GetAtt form.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "test-stack",
      template: {
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
      },
    });

    // Then the dotted-string form produces the same deployed Resource result as
    // the array form.
    const derivedBucket = simAws
      .s3()
      .getSimBucketByName("source-bucket.foo-derived");
    const sourceResource = stack.resources.get("SourceBucket");
    const derivedResource = stack.resources.get("DerivedBucket");

    assertNonNullable(derivedBucket);
    assertInstanceOf(derivedBucket, SimS3Bucket);
    assertIdentical(derivedBucket.bucketName, "source-bucket.foo-derived");

    assertNonNullable(sourceResource);
    assertNonNullable(derivedResource);
    assertIdentical(sourceResource.status, "CREATE_COMPLETE");
    assertIdentical(derivedResource.status, "CREATE_COMPLETE");
  });

  it("rejects array-form Fn::GetAtt with the wrong number of values", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "test-stack",
        template: {
          Resources: {
            TestBucket: {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: {
                  "Fn::GetAtt": ["SourceBucket"],
                },
              },
            },
          },
        },
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::GetAtt array value must be [logicalId, attributeName]",
    );
  });

  it("rejects array-form Fn::GetAtt with non-string values", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "test-stack",
        template: {
          Resources: {
            TestBucket: {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: {
                  "Fn::GetAtt": ["SourceBucket", 123],
                },
              },
            },
          },
        },
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::GetAtt array values must be strings",
    );
  });

  it("rejects dotted-string Fn::GetAtt without an attribute name", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "test-stack",
        template: {
          Resources: {
            TestBucket: {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: {
                  "Fn::GetAtt": "SourceBucket.",
                },
              },
            },
          },
        },
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::GetAtt string value must be LogicalId.AttributeName",
    );
  });

  it("rejects Fn::GetAtt values that are neither an array nor a string", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "test-stack",
        template: {
          Resources: {
            TestBucket: {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: {
                  "Fn::GetAtt": {
                    LogicalId: "SourceBucket",
                    AttributeName: "foo",
                  },
                },
              },
            },
          },
        },
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::GetAtt value must be [logicalId, attributeName] or LogicalId.AttributeName",
    );
  });
});

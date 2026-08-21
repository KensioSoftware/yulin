import {
  GetBucketPolicyCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimIamMalformedPolicyDocument } from "../../../iam/error/sim-iam.error.js";
import { SimS3NoSuchBucket } from "../../error/sim-s3.error.js";

describe("S3 CloudFormation BucketPolicy Resource", () => {
  const publicReadStatement = {
    Effect: "Allow",
    Principal: "*",
    Action: "s3:GetObject",
    Resource: "arn:aws:s3:::reports/*",
  };

  it("attaches a Bucket policy declared alongside its Bucket", async () => {
    // Given a template declaring a Bucket and a policy referencing it by Ref.
    const template = {
      Resources: {
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "reports",
            PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
          },
        },
        ReportsBucketPolicy: {
          Type: "AWS::S3::BucketPolicy",
          Properties: {
            Bucket: { Ref: "ReportsBucket" },
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [publicReadStatement],
            },
          },
        },
      },
    };

    // When the template is deployed.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reports-stack",
      template,
    });

    // Then the policy is on the Bucket and the Resource was not skipped.
    const output = await simAws
      .s3()
      .getBucketPolicy(new GetBucketPolicyCommand({ Bucket: "reports" }));

    assertObjectEquals(JSON.parse(output.Policy), {
      Version: "2012-10-17",
      Statement: [publicReadStatement],
    });

    const resource = stack.getResource("ReportsBucketPolicy");
    assertNonNullable(resource);
    assertIdentical(resource.status, "CREATE_COMPLETE");
    assertArrayLength(stack.skippedResources, 0);
  });

  it("enforces a deployed Bucket policy through the Object authorizers", async () => {
    // Given a deployed Bucket policy granting anonymous reads under one prefix.
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      stackName: "enforced-stack",
      template: {
        Resources: {
          ReportsBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "reports",
              // A public Bucket policy needs Block Public Access turned off,
              // exactly as a real deployment does.
              PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
            },
          },
          ReportsBucketPolicy: {
            Type: "AWS::S3::BucketPolicy",
            Properties: {
              Bucket: { Ref: "ReportsBucket" },
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    ...publicReadStatement,
                    Resource: "arn:aws:s3:::reports/public/*",
                  },
                ],
              },
            },
          },
        },
      },
    });

    const simS3 = simAws.s3();
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "reports",
        Key: "public/q3.txt",
        Body: "quarterly numbers",
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "reports",
        Key: "private/q3.txt",
        Body: "not for publication",
      }),
    );

    // When an anonymous caller reads an Object the policy covers.
    const output = await simS3.getObject(
      new GetObjectCommand({ Bucket: "reports", Key: "public/q3.txt" }),
      { caller: { kind: "anonymous" } },
    );

    // Then the deployed policy authorizes it, as an SDK-applied policy would.
    assertNonNullable(output.Body);

    // And the same caller is denied an Object outside the policy's Resource.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({ Bucket: "reports", Key: "private/q3.txt" }),
        { caller: { kind: "anonymous" } },
      ),
    );
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("accepts a Bucket named by a literal string rather than a Ref", async () => {
    // Given a template naming the Bucket as a plain string, so the engine has
    // no dependency edge to order the two Resources by.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "literal-stack",
      template: {
        Resources: {
          ReportsBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "reports",
              // A public Bucket policy needs Block Public Access turned off,
              // exactly as a real deployment does.
              PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
            },
          },
          ReportsBucketPolicy: {
            Type: "AWS::S3::BucketPolicy",
            Properties: {
              Bucket: "reports",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [publicReadStatement],
              },
            },
          },
        },
      },
    });

    // Then the policy still reaches the Bucket.
    const resource = stack.getResource("ReportsBucketPolicy");
    assertNonNullable(resource);
    assertIdentical(resource.status, "CREATE_COMPLETE");

    const output = await simAws
      .s3()
      .getBucketPolicy(new GetBucketPolicyCommand({ Bucket: "reports" }));
    assertObjectEquals(JSON.parse(output.Policy), {
      Version: "2012-10-17",
      Statement: [publicReadStatement],
    });
  });

  it("fails the Stack when the named Bucket does not exist", async () => {
    // Given a Bucket policy naming a Bucket no Resource creates.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "orphan-policy-stack",
        template: {
          Resources: {
            OrphanBucketPolicy: {
              Type: "AWS::S3::BucketPolicy",
              Properties: {
                Bucket: "never-created",
                PolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [publicReadStatement],
                },
              },
            },
          },
        },
      }),
    );

    // Then the Stack fails with a diagnostic naming the logical ID and Bucket.
    assertInstanceOf(error, SimS3NoSuchBucket);
    assertStringIncludes(error.message, "OrphanBucketPolicy");
    assertStringIncludes(error.message, "never-created");
  });

  it("fails the Stack when the policy document is malformed", async () => {
    // Given a Bucket policy whose statement effect is not an IAM effect.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "malformed-policy-stack",
        template: {
          Resources: {
            ReportsBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "reports" },
            },
            ReportsBucketPolicy: {
              Type: "AWS::S3::BucketPolicy",
              Properties: {
                Bucket: { Ref: "ReportsBucket" },
                PolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [{ ...publicReadStatement, Effect: "Permit" }],
                },
              },
            },
          },
        },
      }),
    );

    // Then the normal PutBucketPolicy validation rejects it.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
  });

  it("rejects a Resource without a usable Bucket name or PolicyDocument", async () => {
    // Given a Bucket policy Resource missing its Bucket property.
    const simAws = new SimAws();

    // When the template is deployed.
    const bucketError = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "no-bucket-stack",
        template: {
          Resources: {
            NamelessBucketPolicy: {
              Type: "AWS::S3::BucketPolicy",
              Properties: {
                PolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [publicReadStatement],
                },
              },
            },
          },
        },
      }),
    );

    // Then the Resource is rejected by name rather than silently skipped.
    assertStringIncludes(bucketError.message, "NamelessBucketPolicy");
    assertStringIncludes(bucketError.message, "Bucket name string");

    // When a Resource instead omits its PolicyDocument.
    const documentError = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "no-document-stack",
        template: {
          Resources: {
            ReportsBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "reports" },
            },
            EmptyBucketPolicy: {
              Type: "AWS::S3::BucketPolicy",
              Properties: { Bucket: { Ref: "ReportsBucket" } },
            },
          },
        },
      }),
    );

    // Then that missing property is reported the same way.
    assertStringIncludes(documentError.message, "EmptyBucketPolicy");
    assertStringIncludes(documentError.message, "PolicyDocument object");
  });
});

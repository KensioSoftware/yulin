import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "../../aws/sim-aws.js";
import {
  SimS3BucketNotEmpty,
  SimS3NoSuchBucketPolicy,
} from "../error/sim-s3.error.js";

describe("S3 CloudFormation Resource teardown", () => {
  const policyStatement = {
    Effect: "Allow",
    Principal: "*",
    Action: "s3:GetObject",
    Resource: "arn:aws:s3:::reports/*",
  };

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
            Statement: [policyStatement],
          },
        },
      },
    },
  };

  it("deletes a Bucket after the policy declared on it", async () => {
    // Given a deployed Bucket carrying a Bucket policy.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "reports-stack", template });

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the Bucket is gone from simulated S3.
    assertUndefined(simAws.s3().getSimBucketByName("reports"));

    // And both Resources report a completed deletion.
    assertIdentical(
      stack.getResource("ReportsBucketPolicy")?.status,
      "DELETE_COMPLETE",
    );
    assertIdentical(
      stack.getResource("ReportsBucket")?.status,
      "DELETE_COMPLETE",
    );
  });

  it("takes the policy off the Bucket before the Bucket goes", async () => {
    // Given a deployed Bucket policy, on a Bucket declared outside the Stack
    // so the Bucket outlives the teardown and can be asked about the policy.
    const simAws = new SimAws();
    await simAws.s3().createBucket({ input: { Bucket: "reports" } });

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "policy-only-stack",
      template: {
        Resources: {
          ReportsBucketPolicy: {
            Type: "AWS::S3::BucketPolicy",
            Properties: {
              Bucket: "reports",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    ...policyStatement,
                    Principal: { AWS: "arn:aws:iam::111111111111:root" },
                  },
                ],
              },
            },
          },
        },
      },
    });

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the policy is no longer on the Bucket, which is still there.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().getBucketPolicy({ input: { Bucket: "reports" } }),
    );
    assertInstanceOf(error, SimS3NoSuchBucketPolicy);
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));
  });

  it("fails the teardown of a Bucket that still holds Objects", async () => {
    // Given a deployed Bucket someone has put an Object in. A CDK app asks for
    // an autoDeleteObjects custom resource to get past this; a template that
    // does not is refused by S3, and the Stack deletion fails with it.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "held-stack", template });

    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "reports",
        Key: "q3.txt",
        Body: "quarterly numbers",
      }),
    );

    // When the Stack's Resources are torn down.
    const error = await assertThrowsErrorAsync(async () => stack.teardown());

    // Then the Bucket is still there, with the reason it could not go.
    assertInstanceOf(error, SimS3BucketNotEmpty);
    assertStringIncludes(error.message, "ReportsBucket");
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));
    assertIdentical(
      stack.getResource("ReportsBucket")?.status,
      "DELETE_FAILED",
    );
  });
});

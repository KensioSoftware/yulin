import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { Readable } from "node:stream";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../error/sim-iam.error.js";
import type { SimIamUser } from "../../user/sim-iam-user.js";
import { simS3BodyToBuffer } from "../../../s3/storage/s3-body-buffer.js";

/**
 * End-to-end authorization test for a CloudFormation-created IAM User.
 *
 * Both permission paths a User declares in a template are exercised against
 * real requests: the inline `Policies` list, and the Managed Policies named by
 * `ManagedPolicyArns`. Each policy's resource ARN comes from another stack
 * resource through Fn::GetAtt, so intrinsic resolution feeds the same IAM
 * evaluation that decides an S3 request made as that User.
 */
describe("IAM CloudFormation User driven authorization", () => {
  it("allows the User to read Objects only from the Bucket its inline policy names", async () => {
    // Given a stack with two Buckets and a User whose inline policy grants read
    // access scoped to one Bucket's CloudFormation Fn::GetAtt Arn.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const scopedAws = simAws.account(accountId).region("eu-west-2");

    const stack = await scopedAws.cloudFormation().deployTemplate({
      stackName: "iam-user-authz-stack",
      template: {
        Resources: {
          ReportsBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "reports-bucket",
            },
          },
          OtherBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "other-bucket",
            },
          },
          ReportsReaderUser: {
            Type: "AWS::IAM::User",
            Properties: {
              UserName: "ReportsReaderUser",
              Policies: [
                {
                  PolicyName: "ReadReports",
                  PolicyDocument: {
                    Version: "2012-10-17",
                    Statement: [
                      {
                        Effect: "Allow",
                        Action: "s3:GetObject",
                        Resource: {
                          "Fn::Join": [
                            "",
                            [{ "Fn::GetAtt": ["ReportsBucket", "Arn"] }, "/*"],
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    });

    const simS3 = scopedAws.s3();

    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "reports-bucket",
        Key: "daily.json",
        Body: '{"status":"complete"}',
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "other-bucket",
        Key: "secret.json",
        Body: '{"visibility":"private"}',
      }),
    );

    const userResource = stack.getResource("ReportsReaderUser");

    assertNonNullable(userResource);

    const user = userResource.simResource as SimIamUser;

    // When the User reads an Object from the Bucket its inline policy names.
    const output = await simS3.getObject(
      new GetObjectCommand({ Bucket: "reports-bucket", Key: "daily.json" }),
      { caller: { kind: "arn", arn: user.arn } },
    );

    // Then IAM allows it, using the CloudFormation-resolved Bucket ARN.
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from('{"status":"complete"}'),
    );

    // But the same User is denied access to the Bucket not named by the policy.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({ Bucket: "other-bucket", Key: "secret.json" }),
        { caller: { kind: "arn", arn: user.arn } },
      ),
    );

    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:GetObject");
    assertIdentical(error.resource, "arn:aws:s3:::other-bucket/secret.json");
  });

  it("grants access through a stack Managed Policy referenced by ManagedPolicyArns", async () => {
    // Given a stack with a Bucket, a Managed Policy scoped to that Bucket, and a
    // User that attaches the Managed Policy through ManagedPolicyArns.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const scopedAws = simAws.account(accountId).region("eu-west-2");

    const stack = await scopedAws.cloudFormation().deployTemplate({
      stackName: "iam-user-managed-policy-authz-stack",
      template: {
        Resources: {
          ReportsBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "reports-bucket",
            },
          },
          ReportsReadPolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              ManagedPolicyName: "ReportsReadPolicy",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "s3:GetObject",
                    Resource: {
                      "Fn::Join": [
                        "",
                        [{ "Fn::GetAtt": ["ReportsBucket", "Arn"] }, "/*"],
                      ],
                    },
                  },
                ],
              },
            },
          },
          ReportsReaderUser: {
            Type: "AWS::IAM::User",
            Properties: {
              UserName: "ReportsReaderUser",
              ManagedPolicyArns: [{ Ref: "ReportsReadPolicy" }],
            },
          },
        },
      },
    });

    const simS3 = scopedAws.s3();

    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "reports-bucket",
        Key: "daily.json",
        Body: '{"status":"complete"}',
      }),
    );

    const userResource = stack.getResource("ReportsReaderUser");

    assertNonNullable(userResource);

    const user = userResource.simResource as SimIamUser;

    // When the User reads an Object from the Bucket its attached policy names.
    const output = await simS3.getObject(
      new GetObjectCommand({ Bucket: "reports-bucket", Key: "daily.json" }),
      { caller: { kind: "arn", arn: user.arn } },
    );

    // Then the CloudFormation-attached Managed Policy grants access.
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from('{"status":"complete"}'),
    );
  });
});

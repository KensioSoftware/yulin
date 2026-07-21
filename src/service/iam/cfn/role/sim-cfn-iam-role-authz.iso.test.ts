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
import type { SimIamRole } from "../../role/sim-iam-role.js";
import { simS3BodyToBuffer } from "../../../s3/storage/s3-body-buffer.js";

/**
 * End-to-end authorization test for a CloudFormation-created IAM Role.
 *
 * Both the Role and its inline permissions policy come entirely from the
 * CloudFormation template. The policy's resource ARN is built from another
 * stack resource via Fn::GetAtt, so this exercises the whole path: intrinsic
 * resolution against real stack resources produces an inline Role policy that
 * then drives genuine IAM authorization decisions against those same resources.
 */
describe("IAM CloudFormation Role driven authorization", () => {
  it("allows the Role to read Objects only from the Bucket its inline policy names", async () => {
    // Given a stack with two S3 Buckets and a Role whose inline policy grants
    // read access scoped to one Bucket's CloudFormation Fn::GetAtt Arn.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const scopedAws = simAws.account(accountId).region("eu-west-2");

    const stack = await scopedAws.cloudFormation().deployTemplate({
      stackName: "iam-role-authz-stack",
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
          ReportsReaderRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: "ReportsReaderRole",
              AssumeRolePolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Principal: { AWS: `arn:aws:iam::${accountId}:root` },
                    Action: "sts:AssumeRole",
                  },
                ],
              },
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

    const roleResource = stack.getResource("ReportsReaderRole");

    assertNonNullable(roleResource);

    const role = roleResource.simResource as SimIamRole;
    const roleArn = role.arn;

    // When the Role reads an Object from the Bucket its inline policy names.
    const output = await simS3.getObject(
      new GetObjectCommand({ Bucket: "reports-bucket", Key: "daily.json" }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM allows it, using the CloudFormation-resolved Bucket ARN.
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from('{"status":"complete"}'),
    );

    // But the same Role is denied access to the Bucket not named by the policy.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({ Bucket: "other-bucket", Key: "secret.json" }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:GetObject");
    assertIdentical(error.resource, "arn:aws:s3:::other-bucket/secret.json");
  });

  it("grants access through a stack Managed Policy referenced by ManagedPolicyArns", async () => {
    // Given a stack with a Bucket, a Managed Policy scoped to that Bucket, and a
    // Role that attaches the Managed Policy through ManagedPolicyArns.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const scopedAws = simAws.account(accountId).region("eu-west-2");

    const stack = await scopedAws.cloudFormation().deployTemplate({
      stackName: "iam-role-managed-policy-authz-stack",
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
          ReportsReaderRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: "ReportsReaderRole",
              AssumeRolePolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Principal: { AWS: `arn:aws:iam::${accountId}:root` },
                    Action: "sts:AssumeRole",
                  },
                ],
              },
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

    const roleResource = stack.getResource("ReportsReaderRole");

    assertNonNullable(roleResource);

    const role = roleResource.simResource as SimIamRole;
    const roleArn = role.arn;

    // When the Role reads an Object from the Bucket its attached policy names.
    const output = await simS3.getObject(
      new GetObjectCommand({ Bucket: "reports-bucket", Key: "daily.json" }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then the CloudFormation-attached Managed Policy grants access.
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from('{"status":"complete"}'),
    );
  });
});

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { Readable } from "node:stream";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../error/sim-iam.error.js";
import type { SimIamManagedPolicy } from "../../policy/sim-iam-policy.js";
import type { SimIamRole } from "../../role/sim-iam-role.js";
import { simS3BodyToBuffer } from "../../../s3/storage/s3-body-buffer.js";

/**
 * The `Roles` property of an AWS::IAM::ManagedPolicy names the Roles the
 * created policy is attached to, and the attachment is what carries the policy
 * into an authorization decision made for one of those Roles.
 */
describe("IAM CloudFormation ManagedPolicy Role attachment", () => {
  it("attaches a stack Managed Policy to the Role its Roles property names", async () => {
    // Given a stack whose Role and Managed Policy are declared together, with
    // the policy naming the Role in its Roles property.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const scopedAws = simAws.account(accountId).region(region);

    const stack = await scopedAws.cloudFormation().deployTemplate({
      stackName: "attached-managed-policy-stack",
      template: {
        Resources: {
          ArchiveBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "archive-bucket" },
          },
          ClosedBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "closed-bucket" },
          },
          ArchiveReaderRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: "ArchiveReader",
              AssumeRolePolicyDocument: {
                Version: "2012-10-17",
                Statement: {
                  Effect: "Allow",
                  Principal: { Service: "lambda.amazonaws.com" },
                  Action: "sts:AssumeRole",
                },
              },
            },
          },
          ArchiveReadPolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              ManagedPolicyName: "ArchiveReadPolicy",
              Roles: [{ Ref: "ArchiveReaderRole" }],
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "s3:GetObject",
                    Resource: {
                      "Fn::Join": [
                        "",
                        [{ "Fn::GetAtt": ["ArchiveBucket", "Arn"] }, "/*"],
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    });

    const simS3 = scopedAws.s3();

    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "archive-bucket",
        Key: "ledger.json",
        Body: '{"entries":3}',
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "closed-bucket",
        Key: "ledger.json",
        Body: '{"entries":0}',
      }),
    );

    // Then the Stack attached the policy to the Role it named.
    const policyResource = stack.getResource("ArchiveReadPolicy");
    const roleResource = stack.getResource("ArchiveReaderRole");

    assertNonNullable(policyResource);
    assertNonNullable(roleResource);

    const policy = policyResource.simResource as SimIamManagedPolicy;
    const role = roleResource.simResource as SimIamRole;

    assertTrue(role.attachedPolicyArns.has(policy.arn));

    // When the Role reads an Object from the Bucket the attached policy names.
    const roleArn = `arn:aws:iam::${accountId}:role/ArchiveReader`;

    const output = await simS3.getObject(
      new GetObjectCommand({ Bucket: "archive-bucket", Key: "ledger.json" }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM allows it on the strength of the attachment the Stack made.
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from('{"entries":3}'),
    );

    // But the same Role is denied the Bucket the policy does not name.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({ Bucket: "closed-bucket", Key: "ledger.json" }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:GetObject");
    assertIdentical(error.resource, "arn:aws:s3:::closed-bucket/ledger.json");
  });
});

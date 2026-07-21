import {
  AttachRolePolicyCommand,
  CreateRoleCommand,
} from "@aws-sdk/client-iam";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { ChangeResourceRecordSetsCommand } from "@aws-sdk/client-route-53";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { Readable } from "node:stream";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../error/sim-iam.error.js";
import type { SimIamManagedPolicy } from "../../policy/sim-iam-policy.js";
import { simS3BodyToBuffer } from "../../../s3/storage/s3-body-buffer.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";

/**
 * End-to-end authorization for a CloudFormation-created Managed Policy attached
 * to a Role via AttachRolePolicy.
 *
 * The Managed Policy document is built from real CloudFormation
 * Ref/Fn::GetAtt/Fn::Join values against other stack resources, then attached
 * to a Role by ARN. Authorization resolves the attached managed policy from the
 * account policy store at evaluation time, so this exercises genuine IAM
 * decisions driven by the CloudFormation-resolved policy against those same
 * resources.
 */
describe("IAM CloudFormation ManagedPolicy driven authorization", () => {
  it("allows a Role to read Objects only from the Bucket its stack Managed Policy names", async () => {
    // Given a stack with two S3 Buckets and a Managed Policy whose resource ARN is
    // built from one Bucket's CloudFormation Fn::GetAtt Arn.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const scopedAws = simAws.account(accountId).region(region);

    const stack = await scopedAws.cloudFormation().deployTemplate({
      stackName: "s3-managed-policy-stack",
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
        },
      },
    });

    const simS3 = scopedAws.s3();
    const simIam = scopedAws.iam();

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

    // And a Role with that stack Managed Policy attached by ARN.
    const policyResource = stack.getResource("ReportsReadPolicy");

    assertNonNullable(policyResource);

    const policy = policyResource.simResource as SimIamManagedPolicy;

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ReportsReader",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "ReportsReader",
        PolicyArn: policy.arn,
      }),
    );

    // When the Role reads an Object from the Bucket named by the Managed Policy.
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

  it("allows a Role to change records only in the Hosted Zone its stack Managed Policy names", async () => {
    // Given a stack with two Route53 Hosted Zones and a Managed Policy scoped to one
    // Hosted Zone's CloudFormation Ref (the zone ID).
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const scopedAws = simAws.account(accountId).region(region);

    const stack = await scopedAws.cloudFormation().deployTemplate({
      stackName: "route53-managed-policy-stack",
      template: {
        Resources: {
          AllowedZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: {
              Name: "allowed.example.test",
            },
          },
          OtherZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: {
              Name: "other.example.test",
            },
          },
          ZoneWritePolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              ManagedPolicyName: "ZoneWritePolicy",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "route53:ChangeResourceRecordSets",
                    Resource: {
                      "Fn::Join": [
                        "",
                        [
                          "arn:aws:route53:::hostedzone/",
                          { Ref: "AllowedZone" },
                        ],
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

    const simRoute53 = scopedAws.route53();
    const simIam = scopedAws.iam();

    const allowedZoneResource = stack.getResource("AllowedZone");
    const otherZoneResource = stack.getResource("OtherZone");

    assertNonNullable(allowedZoneResource);
    assertNonNullable(otherZoneResource);

    const allowedZoneId = allowedZoneResource.refValue;
    const otherZoneId = otherZoneResource.refValue;

    assertTypeString(allowedZoneId);
    assertTypeString(otherZoneId);

    // And a Role with that stack Managed Policy attached by ARN.
    const policyResource = stack.getResource("ZoneWritePolicy");

    assertNonNullable(policyResource);

    const policy = policyResource.simResource as SimIamManagedPolicy;

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ZoneWriter",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "ZoneWriter",
        PolicyArn: policy.arn,
      }),
    );

    // When the Role changes a record in the Hosted Zone named by the Managed Policy.
    const output = await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: allowedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                Name: "app.allowed.example.test",
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: "10.0.0.1" }],
              },
            },
          ],
        },
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM allows it, using the CloudFormation-resolved Hosted Zone ID.
    assertNonNullable(output.ChangeInfo?.Id);

    // But the same Role is denied changes in the Hosted Zone not named by the policy.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.changeResourceRecordSets(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: otherZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: "UPSERT",
                ResourceRecordSet: {
                  Name: "app.other.example.test",
                  Type: "A",
                  TTL: 300,
                  ResourceRecords: [{ Value: "10.0.0.2" }],
                },
              },
            ],
          },
        }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "route53:ChangeResourceRecordSets");
    assertIdentical(
      error.resource,
      `arn:aws:route53:::hostedzone/${otherZoneId}`,
    );
  });
});

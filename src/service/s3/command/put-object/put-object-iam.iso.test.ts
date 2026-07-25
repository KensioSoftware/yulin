import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { Readable } from "node:stream";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";

describe("S3 PutObjectCommand IAM authorization", () => {
  it("allows the default Account root caller", async () => {
    // Given an S3 Bucket in a simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region(region).s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "root-object-bucket" }),
    );

    // When PutObject is called without an explicit caller.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "root-object-bucket",
        Key: "documents/root.txt",
        Body: "written by root",
      }),
    );

    // Then IAM defaults to Account root and the Object reaches S3 storage.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "root-object-bucket",
        Key: "documents/root.txt",
      }),
    );
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from("written by root"),
    );
  });

  it("allows a Role when its action, object resource, and condition match", async () => {
    // Given a Role allowed to put one Object when its principal ARN matches.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-west-1").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "conditional-object-bucket" }),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionalObjectWriter",
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
    const roleArn = roleCreation.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionalObjectWriter",
        PolicyName: "PutConditionalObject",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:PutObject",
            Resource:
              "arn:aws:s3:::conditional-object-bucket/reports/daily.json",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role writes the specifically authorized Object.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "conditional-object-bucket",
        Key: "reports/daily.json",
        Body: '{"status":"complete"}',
        Metadata: {
          source: "daily-job",
        },
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then IAM permits the write and the next S3 operation sees its content.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "conditional-object-bucket",
        Key: "reports/daily.json",
      }),
    );
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from('{"status":"complete"}'),
    );
    assertIdentical(output.Metadata?.["source"], "daily-job");
  });

  it("implicitly denies a Role when its policy condition does not match", async () => {
    // Given a Role policy conditioned on a different principal ARN.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-central-1").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "condition-denied-objects" }),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchObjectWriter",
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
    const roleArn = roleCreation.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionMismatchObjectWriter",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:PutObject",
            Resource:
              "arn:aws:s3:::condition-denied-objects/private/report.txt",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role writes the otherwise matching Object.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "condition-denied-objects",
          Key: "private/report.txt",
          Body: "restricted",
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then IAM denies the exact S3 action and Object ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:PutObject");
    assertIdentical(
      error.resource,
      "arn:aws:s3:::condition-denied-objects/private/report.txt",
    );
  });

  it("applies an explicit Deny before replacing an existing Object", async () => {
    // Given an existing Object and a Role broadly allowed to write except to it.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("us-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "protected-object-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "protected-object-bucket",
        Key: "protected/config.json",
        Body: '{"version":"original"}',
      }),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "RestrictedObjectWriter",
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
    const roleArn = roleCreation.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "RestrictedObjectWriter",
        PolicyName: "RestrictedObjectWrites",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:PutObject",
              Resource: "arn:aws:s3:::protected-object-bucket/*",
            },
            {
              Effect: "Deny",
              Action: "s3:PutObject",
              Resource:
                "arn:aws:s3:::protected-object-bucket/protected/config.json",
            },
          ],
        }),
      }),
    );

    // When the Role attempts to replace the explicitly denied Object.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "protected-object-bucket",
          Key: "protected/config.json",
          Body: '{"version":"replacement"}',
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then the Deny wins and S3 retains the original Object content.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(
      error.message,
      `User: ${roleArn} is not authorized to perform: s3:PutObject on resource: arn:aws:s3:::protected-object-bucket/protected/config.json`,
    );

    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "protected-object-bucket",
        Key: "protected/config.json",
      }),
    );
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from('{"version":"original"}'),
    );
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given an existing Bucket where an omitted caller would default to root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region("ap-southeast-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "anonymous-object-bucket" }),
    );

    // When an explicitly anonymous caller attempts to put an Object.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "anonymous-object-bucket",
          Key: "anonymous.txt",
          Body: "anonymous content",
        }),
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then IAM preserves anonymity and denies the Object write.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);

    // And a subsequent Account root request can write and retrieve the Object.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "anonymous-object-bucket",
        Key: "anonymous.txt",
        Body: "root content",
      }),
    );
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "anonymous-object-bucket",
        Key: "anonymous.txt",
      }),
    );
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from("root content"),
    );
  });
});

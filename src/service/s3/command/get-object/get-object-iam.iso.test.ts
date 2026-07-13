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
import { SimS3 } from "../../sim-s3.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";

describe("S3 GetObjectCommand IAM authorization", () => {
  it("allows the default Account root caller and returns the Object", async () => {
    // Given an Object in an S3 Bucket owned by a simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "root-readable-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "root-readable-bucket",
        Key: "documents/root.txt",
        Body: "read by root",
        Metadata: {
          source: "root-test",
        },
      }),
    );

    // When GetObject is called without an explicit caller.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "root-readable-bucket",
        Key: "documents/root.txt",
      }),
    );

    // Then IAM defaults to Account root and S3 returns the stored Object.
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from("read by root"),
    );
    assertIdentical(output.Metadata?.["source"], "root-test");
  });

  it("allows a Role when its action, Object resource, and condition match", async () => {
    // Given an Object and a Role allowed to read it when its principal ARN matches.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-west-1").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "conditional-read-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "conditional-read-bucket",
        Key: "reports/daily.json",
        Body: '{"status":"complete"}',
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionalObjectReader",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionalObjectReader",
        PolicyName: "ReadConditionalObject",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::conditional-read-bucket/reports/daily.json",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role gets the specifically authorized Object.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "conditional-read-bucket",
        Key: "reports/daily.json",
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then IAM permits the read and the S3 body integration returns its content.
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from('{"status":"complete"}'),
    );
  });

  it("implicitly denies a Role when its policy condition does not match", async () => {
    // Given an existing Object and a Role policy conditioned on another principal.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-central-1").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "condition-denied-reads" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "condition-denied-reads",
        Key: "private/report.txt",
        Body: "restricted",
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchObjectReader",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionMismatchObjectReader",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::condition-denied-reads/private/report.txt",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role attempts to get the otherwise matching Object.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({
          Bucket: "condition-denied-reads",
          Key: "private/report.txt",
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then IAM denies the exact GetObject action and Object ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:GetObject");
    assertIdentical(
      error.resource,
      "arn:aws:s3:::condition-denied-reads/private/report.txt",
    );
  });

  it("applies an explicit Deny while allowing another Object read", async () => {
    // Given two Objects and a Role broadly allowed to read except one protected key.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("us-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "restricted-read-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "restricted-read-bucket",
        Key: "protected/config.json",
        Body: '{"visibility":"protected"}',
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "restricted-read-bucket",
        Key: "public/config.json",
        Body: '{"visibility":"public"}',
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "RestrictedObjectReader",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "RestrictedObjectReader",
        PolicyName: "RestrictedObjectReads",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::restricted-read-bucket/*",
            },
            {
              Effect: "Deny",
              Action: "s3:GetObject",
              Resource:
                "arn:aws:s3:::restricted-read-bucket/protected/config.json",
            },
          ],
        }),
      }),
    );

    // When the Role attempts to get the explicitly denied Object.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({
          Bucket: "restricted-read-bucket",
          Key: "protected/config.json",
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then the explicit Deny wins.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(
      error.message,
      `User: ${roleArn} is not authorized to perform: s3:GetObject on resource: arn:aws:s3:::restricted-read-bucket/protected/config.json`,
    );

    // And the broader Allow still reaches S3 storage for another Object.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "restricted-read-bucket",
        Key: "public/config.json",
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from('{"visibility":"public"}'),
    );
  });

  it("does not reveal a missing key to an unauthorized anonymous caller", async () => {
    // Given an existing Bucket where an omitted caller would default to root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region("ap-southeast-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "private-read-bucket" }),
    );

    // When an anonymous caller requests a key that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({
          Bucket: "private-read-bucket",
          Key: "missing.txt",
        }),
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then authorization fails before Object lookup can reveal key existence.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
    assertIdentical(
      error.resource,
      "arn:aws:s3:::private-read-bucket/missing.txt",
    );
  });

  it("uses allow-all authorization when SimS3 is instantiated directly", async () => {
    // Given standalone S3 containing an Object and no supplied IAM implementation.
    const simS3 = new SimS3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "standalone-read-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "standalone-read-bucket",
        Key: "anonymous.txt",
        Body: "standalone content",
      }),
    );

    // When an anonymous caller gets the Object through standalone SimS3.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "standalone-read-bucket",
        Key: "anonymous.txt",
      }),
      {
        caller: { kind: "anonymous" },
      },
    );

    // Then the allow-all fallback permits the request and storage returns the body.
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from("standalone content"),
    );
  });
});

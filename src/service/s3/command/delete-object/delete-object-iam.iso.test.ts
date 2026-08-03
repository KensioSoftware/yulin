import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
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
import { SimS3NoSuchKey } from "../../error/sim-s3.error.js";

const assumedByAccountRoot = (accountId: string): string =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Principal: { AWS: `arn:aws:iam::${accountId}:root` },
      Action: "sts:AssumeRole",
    },
  });

describe("S3 DeleteObjectCommand IAM authorization", () => {
  it("denies a caller allowed to read but not to delete", async () => {
    // Given a Role allowed to read Objects in a Bucket and nothing more
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "read-only" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "read-only",
        Key: "keep.txt",
        Body: "kept",
      }),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ObjectReader",
        AssumeRolePolicyDocument: assumedByAccountRoot(accountId),
      }),
    );
    const roleArn = roleCreation.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ObjectReader",
        PolicyName: "ReadObjects",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::read-only/*",
          },
        }),
      }),
    );

    // When the Role tries to delete an Object
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteObject(
        new DeleteObjectCommand({ Bucket: "read-only", Key: "keep.txt" }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then IAM denies the delete action against the Object ARN
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:DeleteObject");
    assertIdentical(error.resource, "arn:aws:s3:::read-only/keep.txt");

    // And the Object is still there
    const output = await simS3.getObject(
      new GetObjectCommand({ Bucket: "read-only", Key: "keep.txt" }),
      { caller: { kind: "arn", arn: roleArn } },
    );
    assertInstanceOf(output.Body, Readable);
  });

  it("allows a caller a Bucket policy grants the delete action", async () => {
    // Given an Object and a Role allowed to delete it by Bucket policy alone
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "shared" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "shared",
        Key: "stale.txt",
        Body: "stale",
      }),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "Cleaner",
        AssumeRolePolicyDocument: assumedByAccountRoot(accountId),
      }),
    );
    const roleArn = roleCreation.Role.Arn;

    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "shared",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: roleArn },
            Action: "s3:DeleteObject",
            Resource: "arn:aws:s3:::shared/*",
          },
        }),
      }),
    );

    // When the Role deletes the Object
    await simS3.deleteObject(
      new DeleteObjectCommand({ Bucket: "shared", Key: "stale.txt" }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then the resource policy was enough, and the Object is gone
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({ Bucket: "shared", Key: "stale.txt" }),
      ),
    );
    assertInstanceOf(error, SimS3NoSuchKey);
  });

  it("uses allow-all authorization when SimS3 is instantiated directly", async () => {
    // Given standalone S3, which has no IAM to consult
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "standalone" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "standalone",
        Key: "gone.txt",
        Body: "content",
      }),
    );

    // When an anonymous caller deletes the Object
    await simS3.deleteObject(
      new DeleteObjectCommand({ Bucket: "standalone", Key: "gone.txt" }),
      { caller: { kind: "anonymous" } },
    );

    // Then the allow-all fallback permits it
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({ Bucket: "standalone", Key: "gone.txt" }),
      ),
    );
    assertInstanceOf(error, SimS3NoSuchKey);
  });
});

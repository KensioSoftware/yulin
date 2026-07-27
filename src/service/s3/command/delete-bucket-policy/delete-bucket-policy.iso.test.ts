import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  DeleteBucketPolicyCommand,
  GetBucketPolicyCommand,
  GetObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimS3NoSuchBucket,
  SimS3NoSuchBucketPolicy,
} from "../../error/sim-s3.error.js";

describe("S3 DeleteBucketPolicyCommand", () => {
  const simAws = new SimAws();

  it("removes the Bucket policy so it no longer grants access", async () => {
    // Given a Bucket whose policy grants an anonymous caller Object reads.
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "revocable-policy-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "revocable-policy-bucket",
        Key: "public/notice.txt",
        Body: "published",
      }),
    );
    // A public grant needs Block Public Access turned off first.
    await simS3.putPublicAccessBlock(
      new PutPublicAccessBlockCommand({
        Bucket: "revocable-policy-bucket",
        PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
      }),
    );
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "revocable-policy-bucket",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::revocable-policy-bucket/public/*",
          },
        }),
      }),
    );

    // When the policy is deleted.
    await simS3.deleteBucketPolicy(
      new DeleteBucketPolicyCommand({ Bucket: "revocable-policy-bucket" }),
    );

    // Then the Bucket reports no policy, and the grant it carried is gone.
    const readError = await assertThrowsErrorAsync(async () =>
      simS3.getBucketPolicy(
        new GetBucketPolicyCommand({ Bucket: "revocable-policy-bucket" }),
      ),
    );
    assertInstanceOf(readError, SimS3NoSuchBucketPolicy);

    const accessError = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({
          Bucket: "revocable-policy-bucket",
          Key: "public/notice.txt",
        }),
        { caller: { kind: "anonymous" } },
      ),
    );
    assertInstanceOf(accessError, SimIamAccessDenied);
  });

  it("succeeds on a Bucket that has no policy to remove", async () => {
    // Given an existing Bucket with no resource policy.
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "idempotent-delete-bucket" }),
    );

    // When the Bucket policy is deleted anyway.
    const output = await simS3.deleteBucketPolicy(
      new DeleteBucketPolicyCommand({ Bucket: "idempotent-delete-bucket" }),
    );

    // Then S3 answers as it does for a Bucket that had one, as real S3 does.
    assertInstanceOf(output.$metadata, Object);
  });

  it("rejects a non-existent Bucket before removing its policy", async () => {
    // Given the top-level simulated S3 service without the requested Bucket.
    const simS3 = simAws.s3();

    // When DeleteBucketPolicy targets the missing Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteBucketPolicy(
        new DeleteBucketPolicyCommand({ Bucket: "absent-bucket" }),
      ),
    );

    // Then S3 returns its missing-Bucket error.
    assertInstanceOf(error, SimS3NoSuchBucket);
    assertIdentical(error.$metadata.httpStatusCode, 404);
  });

  it("rejects a missing required Bucket input", async () => {
    // Given the top-level simulated S3 service.
    const simS3 = simAws.s3();

    // When DeleteBucketPolicy is called without its required Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteBucketPolicy(
        // @ts-expect-error -- testing invalid input
        new DeleteBucketPolicyCommand({}),
      ),
    );

    // Then request validation identifies the missing Bucket input.
    assertStringIncludes(
      error.message,
      "DeleteBucketPolicyCommand.input.Bucket",
    );
  });

  it("denies a caller without DeleteBucketPolicy permission", async () => {
    // Given a Bucket and a Role with no S3 policy-administration grant.
    const accountId = makeSimAwsAccountId();
    const scopedSimAws = new SimAws({ defaultAccountId: accountId });
    const simIam = scopedSimAws.iam();
    const simS3 = scopedSimAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "protected-delete-bucket" }),
    );
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "UnprivilegedPolicyRemover",
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

    // When the unprivileged Role removes the Bucket policy.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteBucketPolicy(
        new DeleteBucketPolicyCommand({ Bucket: "protected-delete-bucket" }),
        { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
      ),
    );

    // Then IAM denies the distinct removal action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:DeleteBucketPolicy");
    assertIdentical(error.resource, "arn:aws:s3:::protected-delete-bucket");
  });

  it("allows removal granted by the Bucket policy itself", async () => {
    // Given a Bucket policy that grants a Role the removal action.
    const accountId = makeSimAwsAccountId();
    const scopedSimAws = new SimAws({ defaultAccountId: accountId });
    const simIam = scopedSimAws.iam();
    const simS3 = scopedSimAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "self-revoking-bucket" }),
    );
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "PolicyRemover",
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
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "self-revoking-bucket",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: roleCreation.Role.Arn },
            Action: "s3:DeleteBucketPolicy",
            Resource: "arn:aws:s3:::self-revoking-bucket",
          },
        }),
      }),
    );

    // When the Role named by that policy removes it.
    await simS3.deleteBucketPolicy(
      new DeleteBucketPolicyCommand({ Bucket: "self-revoking-bucket" }),
      { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
    );

    // Then the policy is gone, so the same call is now denied.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteBucketPolicy(
        new DeleteBucketPolicyCommand({ Bucket: "self-revoking-bucket" }),
        { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
      ),
    );
    assertInstanceOf(error, SimIamAccessDenied);
  });
});

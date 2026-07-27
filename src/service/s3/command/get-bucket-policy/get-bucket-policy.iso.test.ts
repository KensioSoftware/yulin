import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimS3NoSuchBucket,
  SimS3NoSuchBucketPolicy,
} from "../../error/sim-s3.error.js";

describe("S3 GetBucketPolicyCommand", () => {
  const simAws = new SimAws();

  const readReportsPolicy = {
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Principal: {
        AWS: "arn:aws:iam::222222222222:role/ReportReader",
      },
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::readable-policy-bucket/*",
    },
  };

  it("returns the configured Bucket policy as a JSON document string", async () => {
    // Given a Bucket with a resource policy applied through PutBucketPolicy.
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "readable-policy-bucket" }),
    );
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "readable-policy-bucket",
        Policy: JSON.stringify(readReportsPolicy),
      }),
    );

    // When the policy is read back.
    const output = await simS3.getBucketPolicy(
      new GetBucketPolicyCommand({ Bucket: "readable-policy-bucket" }),
    );

    // Then S3 answers with the document serialized as a JSON string.
    assertTypeString(output.Policy);
    assertObjectEquals(JSON.parse(output.Policy), readReportsPolicy);
  });

  it("reports no Bucket policy on a Bucket that has none", async () => {
    // Given an existing Bucket with no resource policy.
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "policy-free-bucket" }),
    );

    // When the Bucket policy is requested.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getBucketPolicy(
        new GetBucketPolicyCommand({ Bucket: "policy-free-bucket" }),
      ),
    );

    // Then S3 distinguishes this from a missing Bucket.
    assertInstanceOf(error, SimS3NoSuchBucketPolicy);
    assertIdentical(error.$metadata.httpStatusCode, 404);
    assertStringIncludes(error.message, "policy-free-bucket");
  });

  it("rejects a non-existent Bucket before reading its policy", async () => {
    // Given the top-level simulated S3 service without the requested Bucket.
    const simS3 = simAws.s3();

    // When GetBucketPolicy targets the missing Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getBucketPolicy(
        new GetBucketPolicyCommand({ Bucket: "never-created-bucket" }),
      ),
    );

    // Then S3 returns its missing-Bucket error rather than a missing-policy one.
    assertInstanceOf(error, SimS3NoSuchBucket);
    assertIdentical(error.$metadata.httpStatusCode, 404);
  });

  it("rejects a missing required Bucket input", async () => {
    // Given the top-level simulated S3 service.
    const simS3 = simAws.s3();

    // When GetBucketPolicy is called without its required Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getBucketPolicy(
        // @ts-expect-error -- testing invalid input
        new GetBucketPolicyCommand({}),
      ),
    );

    // Then request validation identifies the missing Bucket input.
    assertStringIncludes(error.message, "GetBucketPolicyCommand.input.Bucket");
  });

  it("denies a caller without GetBucketPolicy permission", async () => {
    // Given a Bucket and a Role with no S3 policy-read grant.
    const accountId = makeSimAwsAccountId();
    const scopedSimAws = new SimAws({ defaultAccountId: accountId });
    const simIam = scopedSimAws.iam();
    const simS3 = scopedSimAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "guarded-policy-bucket" }),
    );
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "guarded-policy-bucket",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: "arn:aws:iam::222222222222:role/ReportReader",
            },
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::guarded-policy-bucket/*",
          },
        }),
      }),
    );
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "UnprivilegedPolicyReader",
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

    // When the unprivileged Role reads the Bucket policy.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getBucketPolicy(
        new GetBucketPolicyCommand({ Bucket: "guarded-policy-bucket" }),
        { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
      ),
    );

    // Then IAM denies the Bucket-level policy read action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:GetBucketPolicy");
    assertIdentical(error.resource, "arn:aws:s3:::guarded-policy-bucket");
  });

  it("allows a Role granted GetBucketPolicy by its identity policy", async () => {
    // Given a Role whose identity policy grants the Bucket policy read.
    const accountId = makeSimAwsAccountId();
    const scopedSimAws = new SimAws({ defaultAccountId: accountId });
    const simIam = scopedSimAws.iam();
    const simS3 = scopedSimAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "auditable-policy-bucket" }),
    );
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "auditable-policy-bucket",
        Policy: JSON.stringify(readReportsPolicy),
      }),
    );
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "PolicyAuditor",
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
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "PolicyAuditor",
        PolicyName: "ReadBucketPolicies",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetBucketPolicy",
            Resource: "arn:aws:s3:::auditable-policy-bucket",
          },
        }),
      }),
    );

    // When the granted Role reads the Bucket policy.
    const output = await simS3.getBucketPolicy(
      new GetBucketPolicyCommand({ Bucket: "auditable-policy-bucket" }),
      { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
    );

    // Then the stored document is returned.
    assertObjectEquals(JSON.parse(output.Policy), readReportsPolicy);
  });
});

import {
  CreateAccessKeyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { Readable } from "node:stream";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimIamMalformedPolicyDocument } from "../../../iam/error/sim-iam.error.js";
import { SimS3NoSuchBucket } from "../../error/sim-s3.error.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";

describe("S3 PutBucketPolicyCommand", () => {
  const simAws = new SimAws();

  it("configures a Bucket policy that grants an IAM User Object write access", async () => {
    // Given a Bucket and an IAM User with access key credentials but no identity policy.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "policy-granted-writes" }),
    );
    const userOutput = await simIam.createUser(
      new CreateUserCommand({ UserName: "BucketPolicyWriter" }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "BucketPolicyWriter" }),
    );

    // When the Account root caller applies a policy granting the User one Object write.
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "policy-granted-writes",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: userOutput.User.Arn,
            },
            Action: "s3:PutObject",
            Resource: "arn:aws:s3:::policy-granted-writes/shared/report.txt",
          },
        }),
      }),
    );

    // Then the next S3 operation uses the policy to authorize and persist the Object.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "policy-granted-writes",
        Key: "shared/report.txt",
        Body: "written through a bucket policy",
      }),
      {
        caller: {
          kind: "credentials",
          credentials: {
            accessKeyId: accessKeyOutput.AccessKey.AccessKeyId,
            secretAccessKey: accessKeyOutput.AccessKey.SecretAccessKey,
          },
        },
      },
    );
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "policy-granted-writes",
        Key: "shared/report.txt",
      }),
    );

    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from("written through a bucket policy"),
    );
  });

  it("allows a Role to configure a Bucket policy when its policy condition matches", async () => {
    // Given a Role allowed to put a policy only when it is the effective principal.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "conditional-policy-bucket" }),
    );
    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionalPolicyAdministrator",
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
        RoleName: "ConditionalPolicyAdministrator",
        PolicyName: "PutConditionalBucketPolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:PutBucketPolicy",
            Resource: "arn:aws:s3:::conditional-policy-bucket",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role configures a Bucket policy as the matching principal.
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "conditional-policy-bucket",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:PutObject",
            Resource: "arn:aws:s3:::conditional-policy-bucket/public/*",
          },
        }),
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then the configured policy reaches authorization for a subsequent anonymous write.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "conditional-policy-bucket",
        Key: "public/notice.txt",
        Body: "published",
      }),
      {
        caller: { kind: "anonymous" },
      },
    );
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "conditional-policy-bucket",
        Key: "public/notice.txt",
      }),
    );

    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from("published"),
    );
  });

  it("denies a caller without PutBucketPolicy permission", async () => {
    // Given an existing Bucket and a Role without an S3 policy-administration grant.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "protected-policy-bucket" }),
    );
    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "UnprivilegedPolicyWriter",
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

    // When the unprivileged Role attempts to configure the Bucket policy.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketPolicy(
        new PutBucketPolicyCommand({
          Bucket: "protected-policy-bucket",
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: "*",
              Action: "s3:PutObject",
              Resource: "arn:aws:s3:::protected-policy-bucket/*",
            },
          }),
        }),
        {
          caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
        },
      ),
    );

    // Then IAM denies the Bucket-level policy administration action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:PutBucketPolicy");
    assertIdentical(error.resource, "arn:aws:s3:::protected-policy-bucket");
  });

  it("rejects missing required request inputs", async () => {
    // Given the top-level simulated S3 service.
    const simS3 = simAws.s3();

    // When PutBucketPolicy is called without its required Bucket.
    const bucketError = await assertThrowsErrorAsync(async () =>
      simS3.putBucketPolicy(
        // @ts-expect-error -- testing invalid input
        new PutBucketPolicyCommand({
          Policy: JSON.stringify({ Version: "2012-10-17", Statement: [] }),
        }),
      ),
    );

    // Then request validation identifies the missing Bucket input.
    assertStringIncludes(
      bucketError.message,
      "PutBucketPolicyCommand.input.Bucket",
    );

    // When PutBucketPolicy is called without its required Policy.
    const policyError = await assertThrowsErrorAsync(async () =>
      simS3.putBucketPolicy(
        // @ts-expect-error -- testing invalid input
        new PutBucketPolicyCommand({
          Bucket: "missing-policy-bucket",
        }),
      ),
    );

    // Then request validation identifies the missing Policy input.
    assertStringIncludes(
      policyError.message,
      "PutBucketPolicyCommand.input.Policy",
    );
  });

  it("rejects a non-existent Bucket before configuring its policy", async () => {
    // Given the top-level simulated S3 service without the requested Bucket.
    const simS3 = simAws.s3();

    // When PutBucketPolicy targets the missing Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketPolicy(
        new PutBucketPolicyCommand({
          Bucket: "does-not-exist",
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: "*",
              Action: "s3:PutObject",
              Resource: "arn:aws:s3:::does-not-exist/*",
            },
          }),
        }),
      ),
    );

    // Then S3 returns its missing-Bucket error.
    assertInstanceOf(error, SimS3NoSuchBucket);
    assertIdentical(error.$metadata.httpStatusCode, 404);
  });

  it("rejects a policy document with an invalid statement effect", async () => {
    // Given an existing Bucket and an invalid IAM policy document.
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "invalid-policy-bucket" }),
    );

    // When PutBucketPolicy receives the malformed policy.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketPolicy(
        new PutBucketPolicyCommand({
          Bucket: "invalid-policy-bucket",
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: {
              Effect: "Permit",
              Principal: "*",
              Action: "s3:PutObject",
              Resource: "arn:aws:s3:::invalid-policy-bucket/*",
            },
          }),
        }),
      ),
    );

    // Then policy validation rejects it before the Bucket policy is changed.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertIdentical(error.$metadata.httpStatusCode, 400);
  });
});

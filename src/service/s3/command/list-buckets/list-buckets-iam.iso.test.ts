import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimS3 } from "../../sim-s3.js";

describe("S3 ListBucketsCommand IAM authorization", () => {
  it("allows the default Account root caller", async () => {
    // Given a Bucket in an Account-scoped S3 service.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "root-listed-bucket" }),
    );

    // When ListBuckets is called without an explicit caller.
    const output = await simS3.listBuckets(new ListBucketsCommand());

    // Then IAM defaults to Account root and S3 returns the Account's Bucket.
    assertArrayLength(output.Buckets, 1);
    assertIdentical(output.Buckets[0].Name, "root-listed-bucket");
  });

  it("allows a Role when its action, resource, and condition match", async () => {
    // Given a Role allowed to list all Buckets when its principal ARN matches.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-west-1").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "application-bucket" }),
    );
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "archive-bucket" }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "BucketLister",
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

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "BucketLister",
        PolicyName: "ConditionalBucketListing",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListAllMyBuckets",
            Resource: "*",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role lists Buckets with an S3 prefix filter.
    const output = await simS3.listBuckets(
      new ListBucketsCommand({
        Prefix: "application",
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then IAM allows the account-level action and S3 applies the filter.
    assertArrayLength(output.Buckets, 1);
    assertIdentical(output.Buckets[0].Name, "application-bucket");
  });

  it("implicitly denies a bucket-scoped ListAllMyBuckets permission", async () => {
    // Given a Role whose ListAllMyBuckets policy uses a Bucket ARN instead of "*".
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-central-1").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "bucket-scoped-listing" }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "BucketScopedLister",
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

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "BucketScopedLister",
        PolicyName: "BucketScopedListing",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListAllMyBuckets",
            Resource: "arn:aws:s3:::bucket-scoped-listing",
          },
        }),
      }),
    );

    // When the Role attempts the account-level ListBuckets operation.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listBuckets(new ListBucketsCommand(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then the Bucket ARN does not match the required "*" resource.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:ListAllMyBuckets");
    assertIdentical(error.resource, "*");
  });

  it("implicitly denies a Role when its policy condition does not match", async () => {
    // Given a Role with the correct action and resource but a mismatched condition.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("us-east-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "condition-denied-listing" }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchLister",
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

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionMismatchLister",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListAllMyBuckets",
            Resource: "*",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role attempts to list Buckets.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listBuckets(new ListBucketsCommand(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then the condition mismatch causes an implicit access denial.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "arn");
    assertIdentical(error.action, "s3:ListAllMyBuckets");
  });

  it("lets an explicit Deny override an Allow", async () => {
    // Given a Role with both Allow and Deny statements for ListAllMyBuckets.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("us-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "explicitly-denied-listing" }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DeniedBucketLister",
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

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "DeniedBucketLister",
        PolicyName: "ConflictingBucketListing",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:ListAllMyBuckets",
              Resource: "*",
            },
            {
              Effect: "Deny",
              Action: "s3:ListAllMyBuckets",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    // When the Role attempts to list the Account's Buckets.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listBuckets(new ListBucketsCommand(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then the explicit Deny wins and identifies the AWS IAM action and resource.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(
      error.message,
      `User: ${roleArn} is not authorized to perform: s3:ListAllMyBuckets on resource: *`,
    );
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given an Account-scoped S3 service containing a Bucket.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region("ap-southeast-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "anonymous-listing-bucket" }),
    );

    // When an explicitly anonymous caller attempts to list Buckets.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listBuckets(new ListBucketsCommand(), {
        caller: { kind: "anonymous" },
      }),
    );

    // Then the real Account IAM implementation preserves anonymity and denies it.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
  });

  it("uses allow-all authorization when SimS3 is instantiated directly", async () => {
    // Given a directly constructed S3 service with no IAM implementation supplied.
    const simS3 = new SimS3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "standalone-listing-bucket" }),
      {
        caller: { kind: "anonymous" },
      },
    );

    // When an anonymous caller lists Buckets through the standalone service.
    const output = await simS3.listBuckets(new ListBucketsCommand(), {
      caller: { kind: "anonymous" },
    });

    // Then the allow-all fallback permits the request and S3 returns its state.
    assertArrayLength(output.Buckets, 1);
    assertIdentical(output.Buckets[0].Name, "standalone-listing-bucket");
  });
});

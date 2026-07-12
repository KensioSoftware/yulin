import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";

describe("S3 CreateBucketCommand IAM authorization", () => {
  it("allows the default Account root caller", async () => {
    // Given S3 and IAM wired through the same simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region(region).s3();
    simAws.account(accountId).iam();

    // When CreateBucket is called without an explicit caller.
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "root-created-bucket" }),
    );

    // Then IAM defaults to Account root and the Bucket reaches the S3 listing.
    const listOutput = await simS3.listBuckets(new ListBucketsCommand());
    assertArrayLength(listOutput.Buckets, 1);
    assertIdentical(listOutput.Buckets[0].Name, "root-created-bucket");
  });

  it("allows a Role when its policy action, resource, and condition match", async () => {
    // Given a Role whose identity policy condition matches its principal ARN.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region(region).s3();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "BucketCreator",
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
        RoleName: "BucketCreator",
        PolicyName: "CreateConditionalBucket",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:CreateBucket",
            Resource: "arn:aws:s3:::conditional-bucket",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role creates the specifically authorized Bucket.
    const output = await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "conditional-bucket" }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then IAM allows creation and S3 registers the Bucket in its Region.
    assertIdentical(output.BucketArn, "arn:aws:s3:::conditional-bucket");
    assertIdentical(
      simS3.findBucketScope("conditional-bucket")?.regionName,
      region,
    );
  });

  it("implicitly denies a Role when its policy condition does not match", async () => {
    // Given a Role policy conditioned on a different principal ARN.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region(region).s3();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchCreator",
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
        RoleName: "ConditionMismatchCreator",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:CreateBucket",
            Resource: "arn:aws:s3:::condition-denied-bucket",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role attempts to create the otherwise matching Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.createBucket(
        new CreateBucketCommand({ Bucket: "condition-denied-bucket" }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then IAM reports the effective caller and S3 does not register the Bucket.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "arn");
    assertIdentical(error.action, "s3:CreateBucket");
    assertUndefined(simS3.findBucketScope("condition-denied-bucket"));
  });

  it("applies an explicit Deny before creating S3 state", async () => {
    // Given a Role allowed to create Buckets except for one explicitly denied ARN.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region(region).s3();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "RestrictedBucketCreator",
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
        RoleName: "RestrictedBucketCreator",
        PolicyName: "RestrictedBucketCreation",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:CreateBucket",
              Resource: "arn:aws:s3:::*",
            },
            {
              Effect: "Deny",
              Action: "s3:CreateBucket",
              Resource: "arn:aws:s3:::reserved-bucket",
            },
          ],
        }),
      }),
    );

    // When the Role requests the explicitly denied Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.createBucket(
        new CreateBucketCommand({ Bucket: "reserved-bucket" }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then the Deny wins.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.resource, "arn:aws:s3:::reserved-bucket");
    assertIdentical(
      error.message,
      `User: ${roleArn} is not authorized to perform: s3:CreateBucket on resource: arn:aws:s3:::reserved-bucket`,
    );
    assertUndefined(simS3.findBucketScope("reserved-bucket"));

    // And the broader Allow still permits another Bucket
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "permitted-bucket" }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    const listOutput = await simS3.listBuckets(new ListBucketsCommand());
    assertArrayLength(listOutput.Buckets, 1);
    assertIdentical(listOutput.Buckets[0].Name, "permitted-bucket");
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given S3 in an Account where an omitted caller would default to root.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region(region).s3();

    // When an explicitly anonymous caller attempts to create a Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.createBucket(
        new CreateBucketCommand({ Bucket: "anonymous-denied-bucket" }),
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then IAM preserves anonymity, denies access, and leaves the name available.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
    assertUndefined(simS3.findBucketScope("anonymous-denied-bucket"));

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "anonymous-denied-bucket" }),
    );

    assertIdentical(
      simS3.findBucketScope("anonymous-denied-bucket")?.regionName,
      region,
    );
  });
});

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  ListObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

describe("S3 ListObjectsCommand IAM authorization", () => {
  it("allows the default Account root caller and returns a filtered page", async () => {
    // Given a Bucket containing Objects under different prefixes.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "root-list-objects-bucket" }),
    );
    await Promise.all([
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "root-list-objects-bucket",
          Key: "reports/a.json",
          Body: "a",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "root-list-objects-bucket",
          Key: "reports/b.json",
          Body: "bb",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "root-list-objects-bucket",
          Key: "private/c.json",
          Body: "ccc",
        }),
      ),
    ]);

    // When ListObjects is called without an explicit caller.
    const output = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "root-list-objects-bucket",
        Prefix: "reports/",
        MaxKeys: 1,
      }),
    );

    // Then IAM defaults to Account root and S3 applies filtering and pagination.
    assertArrayLength(output.Contents, 1);
    assertIdentical(output.Contents[0].Key, "reports/a.json");
    assertIdentical(output.NextMarker, "reports/a.json");
  });

  it("allows a Role when action, Bucket resource, and request conditions match", async () => {
    // Given a Role allowed to list a specific prefix with a bounded page size.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-west-1").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "conditional-list-bucket" }),
    );
    await Promise.all([
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "conditional-list-bucket",
          Key: "reports/a.json",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "conditional-list-bucket",
          Key: "reports/b.json",
        }),
      ),
    ]);

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionalObjectLister",
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
        RoleName: "ConditionalObjectLister",
        PolicyName: "ListReports",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "arn:aws:s3:::conditional-list-bucket",
            Condition: {
              StringLike: {
                "s3:prefix": "reports/*",
              },
              NumericLessThanEquals: {
                "s3:max-keys": 2,
              },
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role lists the permitted prefix using the permitted page size.
    const output = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "conditional-list-bucket",
        Prefix: "reports/",
        MaxKeys: 2,
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then IAM conditions match and the listing reaches S3 pagination.
    assertArrayLength(output.Contents, 2);
    assertIdentical(output.Contents[0].Key, "reports/a.json");
    assertIdentical(output.Contents[1].Key, "reports/b.json");
  });

  it("denies a Role when its allowed prefix condition does not match", async () => {
    // Given a Role whose ListBucket permission is restricted to a reports prefix.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-central-1").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "prefix-restricted-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "prefix-restricted-bucket",
        Key: "private/secret.json",
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ReportsObjectLister",
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
        RoleName: "ReportsObjectLister",
        PolicyName: "ListReportsOnly",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "arn:aws:s3:::prefix-restricted-bucket",
            Condition: {
              StringLike: {
                "s3:prefix": "reports/*",
              },
            },
          },
        }),
      }),
    );

    // When the Role attempts to list a different prefix.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listObjects(
        new ListObjectsCommand({
          Bucket: "prefix-restricted-bucket",
          Prefix: "private/",
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then the condition mismatch denies the Bucket listing.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:ListBucket");
    assertIdentical(error.resource, "arn:aws:s3:::prefix-restricted-bucket");
  });

  it("does not accept an Object ARN for the Bucket-level ListBucket action", async () => {
    // Given a Role whose ListBucket policy incorrectly targets Object resources.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("us-east-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "bucket-resource-required" }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ObjectScopedLister",
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
        RoleName: "ObjectScopedLister",
        PolicyName: "IncorrectObjectResource",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "arn:aws:s3:::bucket-resource-required/*",
          },
        }),
      }),
    );

    // When the Role attempts to list the Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listObjects(
        new ListObjectsCommand({
          Bucket: "bucket-resource-required",
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then IAM requires the Bucket ARN and rejects the Object-scoped resource.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:ListBucket");
    assertIdentical(error.resource, "arn:aws:s3:::bucket-resource-required");
  });

  it("lets an explicit Deny override an Allow", async () => {
    // Given a Role broadly allowed to list Buckets but denied for one Bucket.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("us-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "protected-listing-bucket" }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "RestrictedBucketLister",
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
        RoleName: "RestrictedBucketLister",
        PolicyName: "RestrictedBucketListings",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:ListBucket",
              Resource: "arn:aws:s3:::*",
            },
            {
              Effect: "Deny",
              Action: "s3:ListBucket",
              Resource: "arn:aws:s3:::protected-listing-bucket",
            },
          ],
        }),
      }),
    );

    // When the Role attempts to list the explicitly denied Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listObjects(
        new ListObjectsCommand({
          Bucket: "protected-listing-bucket",
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then the explicit Deny wins and identifies the Bucket-level request.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(
      error.message,
      `User: ${roleArn} is not authorized to perform: s3:ListBucket on resource: arn:aws:s3:::protected-listing-bucket`,
    );
  });

  it("does not apply Account root fallback to an anonymous caller", async () => {
    // Given a Bucket whose listing would be available to the default root caller.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region("ap-southeast-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "anonymous-list-objects-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "anonymous-list-objects-bucket",
        Key: "private.txt",
      }),
    );

    // When an explicitly anonymous caller attempts to list the Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listObjects(
        new ListObjectsCommand({
          Bucket: "anonymous-list-objects-bucket",
        }),
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then IAM preserves anonymity and rejects the listing before storage access.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
  });
});

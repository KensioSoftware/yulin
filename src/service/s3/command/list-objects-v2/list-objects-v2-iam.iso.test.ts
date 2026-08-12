import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  ListObjectsV2Command,
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

const assumeRoleByAccountRoot = (accountId: string): string =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Principal: { AWS: `arn:aws:iam::${accountId}:root` },
      Action: "sts:AssumeRole",
    },
  });

describe("S3 ListObjectsV2Command IAM authorization", () => {
  it("authorizes a Role against ListBucket on the Bucket, as the first version does", async () => {
    // Given a Role allowed to list one prefix of one Bucket.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "v2-conditional-bucket" }),
    );
    await Promise.all([
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "v2-conditional-bucket",
          Key: "reports/a.json",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "v2-conditional-bucket",
          Key: "private/b.json",
        }),
      ),
    ]);

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "V2ReportsLister",
        AssumeRolePolicyDocument: assumeRoleByAccountRoot(accountId),
      }),
    );
    const roleArn = roleCreation.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "V2ReportsLister",
        PolicyName: "ListReports",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "arn:aws:s3:::v2-conditional-bucket",
            Condition: { StringLike: { "s3:prefix": "reports/*" } },
          },
        }),
      }),
    );

    // When the Role lists the prefix it is allowed.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({
        Bucket: "v2-conditional-bucket",
        Prefix: "reports/",
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then the listing is allowed, so the prefix and page-size condition keys
    // reach IAM from this version of the operation too.
    assertArrayLength(output.Contents, 1);
    assertIdentical(output.Contents[0].Key, "reports/a.json");
  });

  it("denies a Role listing a prefix its policy does not cover", async () => {
    // Given a Role restricted to a reports prefix.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-west-1").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "v2-restricted-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "v2-restricted-bucket",
        Key: "private/secret.json",
      }),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "V2RestrictedLister",
        AssumeRolePolicyDocument: assumeRoleByAccountRoot(accountId),
      }),
    );
    const roleArn = roleCreation.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "V2RestrictedLister",
        PolicyName: "ListReportsOnly",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "arn:aws:s3:::v2-restricted-bucket",
            Condition: { StringLike: { "s3:prefix": "reports/*" } },
          },
        }),
      }),
    );

    // When the Role lists a different prefix.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listObjectsV2(
        new ListObjectsV2Command({
          Bucket: "v2-restricted-bucket",
          Prefix: "private/",
        }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then it is denied before any key is read, so a refused caller learns
    // nothing about what the Bucket holds.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:ListBucket");
    assertIdentical(error.resource, "arn:aws:s3:::v2-restricted-bucket");
  });
});

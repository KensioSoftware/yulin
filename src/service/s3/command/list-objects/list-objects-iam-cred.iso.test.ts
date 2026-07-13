import {
  CreateAccessKeyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  ListObjectsCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

describe("S3 ListObjectsCommand IAM credential authorization", () => {
  it("allows IAM User credentials with matching conditions and paginates the listing", async () => {
    // Given an IAM User allowed to list one prefix in one-key pages.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.region(region).s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "credential-report-listing" }),
    );
    await Promise.all([
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "credential-report-listing",
          Key: "reports/a.json",
          Body: "a",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "credential-report-listing",
          Key: "reports/b.json",
          Body: "bb",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "credential-report-listing",
          Key: "private/secret.json",
          Body: "secret",
        }),
      ),
    ]);
    const userOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "ConditionalObjectLister",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "ConditionalObjectLister",
        PolicyName: "ListReportsOneAtATime",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "arn:aws:s3:::credential-report-listing",
            Condition: {
              StringLike: {
                "s3:prefix": "reports/*",
              },
              NumericLessThanEquals: {
                "s3:max-keys": 1,
              },
              StringEquals: {
                "aws:PrincipalArn": userOutput.User.Arn,
              },
            },
          },
        }),
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "ConditionalObjectLister",
      }),
    );

    // When the User lists the first authorized page with its long-lived credentials.
    const firstPage = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "credential-report-listing",
        Prefix: "reports/",
        MaxKeys: 1,
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

    // Then IAM authorizes the matching request and S3 returns the first page.
    assertArrayLength(firstPage.Contents, 1);
    assertIdentical(firstPage.Contents[0].Key, "reports/a.json");
    assertIdentical(firstPage.NextMarker, "reports/a.json");

    // When the User supplies the marker to request the next page.
    const secondPage = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "credential-report-listing",
        Prefix: "reports/",
        MaxKeys: 1,
        Marker: firstPage.NextMarker,
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

    // Then pagination resumes after the marker without exposing other prefixes.
    assertArrayLength(secondPage.Contents, 1);
    assertIdentical(secondPage.Contents[0].Key, "reports/b.json");
    assertUndefined(secondPage.NextMarker);
  });

  it("allows IAM User credentials through a Bucket resource policy", async () => {
    // Given a User without an identity policy and a Bucket policy granting listing access.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.region(region).s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "resource-policy-listing" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "resource-policy-listing",
        Key: "shared/document.txt",
        Body: "granted by the bucket policy",
      }),
    );
    const userOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "BucketPolicyLister",
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "BucketPolicyLister",
      }),
    );
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "resource-policy-listing",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: userOutput.User.Arn,
            },
            Action: "s3:ListBucket",
            Resource: "arn:aws:s3:::resource-policy-listing",
          },
        }),
      }),
    );

    // When the User lists the Bucket with its long-lived credentials.
    const output = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "resource-policy-listing",
        Prefix: "shared/",
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

    // Then the Bucket policy grants access and S3 returns the stored key.
    assertArrayLength(output.Contents, 1);
    assertIdentical(output.Contents[0].Key, "shared/document.txt");
  });

  it("allows assumed Role credentials through the underlying Role policy", async () => {
    // Given an assumable Role allowed to list a Bucket and a stored Object.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.region(region).s3();
    const roleArn = `arn:aws:iam::${accountId}:role/TemporaryObjectLister`;

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "temporary-credential-listing" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "temporary-credential-listing",
        Key: "documents/session.txt",
        Body: "listed through STS",
      }),
    );
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TemporaryObjectLister",
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
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "TemporaryObjectLister",
        PolicyName: "ListSessionDocuments",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "arn:aws:s3:::temporary-credential-listing",
          },
        }),
      }),
    );
    const assumeRoleOutput = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "list-objects-session",
      }),
    );
    const credentials = assumeRoleOutput.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    // When the temporary access key, secret, and session token are supplied to S3.
    const output = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "temporary-credential-listing",
        Prefix: "documents/",
      }),
      {
        caller: {
          kind: "credentials",
          credentials: {
            accessKeyId: credentials.AccessKeyId,
            secretAccessKey: credentials.SecretAccessKey,
            sessionToken: credentials.SessionToken,
          },
        },
      },
    );

    // Then the session resolves to the Role and S3 returns the stored Object key.
    assertArrayLength(output.Contents, 1);
    assertIdentical(output.Contents[0].Key, "documents/session.txt");
  });

  it("denies valid User credentials when the requested prefix does not satisfy the policy condition", async () => {
    // Given a User permitted to list only the reports prefix of a Bucket.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "prefix-protected-listing" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "prefix-protected-listing",
        Key: "private/secret.json",
      }),
    );
    await simIam.createUser(
      new CreateUserCommand({
        UserName: "ReportsOnlyLister",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "ReportsOnlyLister",
        PolicyName: "ListReportsOnly",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "arn:aws:s3:::prefix-protected-listing",
            Condition: {
              StringLike: {
                "s3:prefix": "reports/*",
              },
            },
          },
        }),
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "ReportsOnlyLister",
      }),
    );

    // When the authenticated User attempts to list the private prefix.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listObjects(
        new ListObjectsCommand({
          Bucket: "prefix-protected-listing",
          Prefix: "private/",
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
      ),
    );

    // Then IAM denies the Bucket-level listing before S3 reads Object keys.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:ListBucket");
    assertIdentical(error.resource, "arn:aws:s3:::prefix-protected-listing");
  });
});

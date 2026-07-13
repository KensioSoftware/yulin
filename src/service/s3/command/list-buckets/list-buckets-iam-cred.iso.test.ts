import {
  CreateAccessKeyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
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
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamInvalidCredentials } from "../../../iam/credential/error/sim-iam-credential.error.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

describe("S3 ListBucketsCommand IAM credential authorization", () => {
  it("allows IAM User credentials and paginates only that Account's matching Buckets", async () => {
    // Given two matching Buckets, another Account's Bucket, and a User allowed to list its Account.
    const accountId = makeSimAwsAccountId();
    const otherAccountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "reports-archive" }),
    );
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "reports-current" }),
    );
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "application-assets" }),
    );
    await simAws
      .account(otherAccountId)
      .s3()
      .createBucket(
        new CreateBucketCommand({ Bucket: "reports-other-account" }),
      );

    const userOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "CredentialBucketLister",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "CredentialBucketLister",
        PolicyName: "ListOwnBuckets",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListAllMyBuckets",
            Resource: "*",
            Condition: {
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
        UserName: "CredentialBucketLister",
      }),
    );

    // When the User requests the first filtered page using its access key.
    const firstPage = await simS3.listBuckets(
      new ListBucketsCommand({
        Prefix: "reports-",
        MaxBuckets: 1,
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

    // Then authentication and authorization succeed before S3 builds an Account-scoped page.
    assertArrayLength(firstPage.Buckets, 1);
    assertIdentical(firstPage.Buckets[0].Name, "reports-archive");
    assertNonNullable(firstPage.ContinuationToken);

    // And the continuation token reaches the next part of the listing simulation.
    const secondPage = await simS3.listBuckets(
      new ListBucketsCommand({
        Prefix: "reports-",
        MaxBuckets: 1,
        ContinuationToken: firstPage.ContinuationToken,
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
    assertArrayLength(secondPage.Buckets, 1);
    assertIdentical(secondPage.Buckets[0].Name, "reports-current");
    assertUndefined(secondPage.ContinuationToken);
  });

  it("allows assumed Role credentials through the underlying Role policy", async () => {
    // Given an assumable Role allowed to list Buckets and an Account containing one Bucket.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();
    const roleArn = `arn:aws:iam::${accountId}:role/TemporaryBucketLister`;

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "temporary-session-bucket" }),
    );
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TemporaryBucketLister",
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
        RoleName: "TemporaryBucketLister",
        PolicyName: "ListBuckets",
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

    const assumeRoleOutput = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "list-buckets-session",
      }),
    );
    const credentials = assumeRoleOutput.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    // When S3 receives the temporary access key, secret, and session token.
    const output = await simS3.listBuckets(new ListBucketsCommand(), {
      caller: {
        kind: "credentials",
        credentials: {
          accessKeyId: credentials.AccessKeyId,
          secretAccessKey: credentials.SecretAccessKey,
          sessionToken: credentials.SessionToken,
        },
      },
    });

    // Then the session resolves to the Role policy and S3 returns the Account's Bucket.
    assertArrayLength(output.Buckets, 1);
    assertIdentical(output.Buckets[0].Name, "temporary-session-bucket");
  });

  it("denies valid User credentials without ListAllMyBuckets permission", async () => {
    // Given a valid User access key whose policy permits a different S3 action.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "authorization-denied-bucket" }),
    );
    await simIam.createUser(
      new CreateUserCommand({
        UserName: "ObjectOnlyUser",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "ObjectOnlyUser",
        PolicyName: "ReadObjectsOnly",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::authorization-denied-bucket/*",
          },
        }),
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "ObjectOnlyUser",
      }),
    );

    // When the authenticated User attempts the account-level listing operation.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listBuckets(new ListBucketsCommand(), {
        caller: {
          kind: "credentials",
          credentials: {
            accessKeyId: accessKeyOutput.AccessKey.AccessKeyId,
            secretAccessKey: accessKeyOutput.AccessKey.SecretAccessKey,
          },
        },
      }),
    );

    // Then authentication succeeds but IAM denies the required global resource.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:ListAllMyBuckets");
    assertIdentical(error.resource, "*");
  });

  it("rejects an incorrect secret before reading Bucket state", async () => {
    // Given an authorized User access key and a Bucket that would otherwise be listed.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "credential-protected-listing" }),
    );
    await simIam.createUser(
      new CreateUserCommand({
        UserName: "AuthorizedBucketLister",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "AuthorizedBucketLister",
        PolicyName: "ListBuckets",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListAllMyBuckets",
            Resource: "*",
          },
        }),
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "AuthorizedBucketLister",
      }),
    );

    // When the registered access key is supplied with an incorrect secret.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listBuckets(new ListBucketsCommand(), {
        caller: {
          kind: "credentials",
          credentials: {
            accessKeyId: accessKeyOutput.AccessKey.AccessKeyId,
            secretAccessKey: "incorrect-secret-access-key",
          },
        },
      }),
    );

    // Then credential authentication fails before authorization or page construction.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "secret-access-key-mismatch");
  });

  it("requires the session token for assumed Role credentials", async () => {
    // Given valid temporary credentials for a Role allowed to list Buckets.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();
    const roleArn = `arn:aws:iam::${accountId}:role/TokenRequiredBucketLister`;

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "session-token-protected-listing" }),
    );
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TokenRequiredBucketLister",
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
        RoleName: "TokenRequiredBucketLister",
        PolicyName: "ListBuckets",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListAllMyBuckets",
            Resource: "*",
          },
        }),
      }),
    );
    const assumeRoleOutput = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "missing-token-session",
      }),
    );
    const credentials = assumeRoleOutput.Credentials;
    assertNonNullable(credentials);
    const accessKeyId = credentials.AccessKeyId;
    assertNonNullable(accessKeyId);
    const secretAccessKey = credentials.SecretAccessKey;
    assertNonNullable(secretAccessKey);

    // When the temporary access key and secret are supplied without the session token.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listBuckets(new ListBucketsCommand(), {
        caller: {
          kind: "credentials",
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        },
      }),
    );

    // Then authentication rejects the incomplete temporary credential set.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "session-token-missing");
  });
});

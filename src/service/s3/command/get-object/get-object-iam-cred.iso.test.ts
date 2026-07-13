import {
  CreateAccessKeyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { Readable } from "node:stream";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamInvalidCredentials } from "../../../iam/credential/error/sim-iam-credential.error.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";

describe("S3 GetObjectCommand IAM credential authorization", () => {
  it("allows IAM User credentials when the policy condition matches", async () => {
    // Given an Object and an IAM User permitted to read it as that principal.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.region(region).s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "user-credential-reads" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "user-credential-reads",
        Key: "reports/current.json",
        Body: '{"status":"ready"}',
        Metadata: {
          source: "credential-test",
        },
      }),
    );
    const userOut = await simIam.createUser(
      new CreateUserCommand({
        UserName: "ObjectReader",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "ObjectReader",
        PolicyName: "ReadCurrentReport",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::user-credential-reads/reports/current.json",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": userOut.User.Arn,
              },
            },
          },
        }),
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "ObjectReader",
      }),
    );

    // When the User reads the Object with its long-lived credentials.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "user-credential-reads",
        Key: "reports/current.json",
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

    // Then IAM authenticates the User and S3 streams the stored Object.
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from('{"status":"ready"}'),
    );
    assertIdentical(output.Metadata?.["source"], "credential-test");
  });

  it("allows IAM User credentials through a Bucket resource policy", async () => {
    // Given a User without an identity policy and a Bucket policy granting it access.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.region(region).s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "resource-policy-reads" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "resource-policy-reads",
        Key: "shared/document.txt",
        Body: "granted by the bucket policy",
      }),
    );
    const userOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "BucketPolicyReader",
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "BucketPolicyReader",
      }),
    );
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "resource-policy-reads",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: userOutput.User.Arn,
            },
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::resource-policy-reads/shared/document.txt",
          },
        }),
      }),
    );

    // When the User requests the Object with its long-lived credentials.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "resource-policy-reads",
        Key: "shared/document.txt",
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

    // Then the Bucket policy grants access and S3 returns the stored body.
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from("granted by the bucket policy"),
    );
  });

  it("allows assumed Role credentials through the underlying Role policy", async () => {
    // Given an assumable Role permitted to read one stored Object.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.region(region).s3();
    const roleArn = `arn:aws:iam::${accountId}:role/TemporaryObjectReader`;

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "temporary-credential-reads" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "temporary-credential-reads",
        Key: "documents/session.txt",
        Body: "read through an STS session",
      }),
    );
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TemporaryObjectReader",
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
        RoleName: "TemporaryObjectReader",
        PolicyName: "ReadSessionDocument",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource:
              "arn:aws:s3:::temporary-credential-reads/documents/session.txt",
          },
        }),
      }),
    );
    const assumeRoleOutput = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "get-object-session",
      }),
    );
    const credentials = assumeRoleOutput.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    // When S3 receives the temporary access key, secret, and session token.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "temporary-credential-reads",
        Key: "documents/session.txt",
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

    // Then the credentials resolve through STS to the Role and storage returns the body.
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from("read through an STS session"),
    );
  });

  it("denies valid User credentials without permission for the Object", async () => {
    // Given a valid IAM User access key whose policy permits a different Object.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "credential-denied-reads" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "credential-denied-reads",
        Key: "private/secret.txt",
        Body: "secret",
      }),
    );
    await simIam.createUser(
      new CreateUserCommand({
        UserName: "LimitedReader",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "LimitedReader",
        PolicyName: "ReadPublicObjects",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::credential-denied-reads/public/*",
          },
        }),
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "LimitedReader",
      }),
    );

    // When the authenticated User requests an Object outside its policy resource.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({
          Bucket: "credential-denied-reads",
          Key: "private/secret.txt",
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

    // Then authentication succeeds but IAM denies the exact Object resource.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:GetObject");
    assertIdentical(
      error.resource,
      "arn:aws:s3:::credential-denied-reads/private/secret.txt",
    );
  });

  it("rejects invalid credentials before revealing whether an Object exists", async () => {
    // Given an existing Bucket and credentials containing an unknown access key.
    const simAws = new SimAws();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "credential-authentication-reads" }),
    );

    // When the invalid credentials request a missing Object.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({
          Bucket: "credential-authentication-reads",
          Key: "missing.txt",
        }),
        {
          caller: {
            kind: "credentials",
            credentials: {
              accessKeyId: "AKIAUNKNOWN",
              secretAccessKey: "not-a-valid-secret",
            },
          },
        },
      ),
    );

    // Then credential authentication fails before S3 performs Object lookup.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "unknown-access-key");
  });
});

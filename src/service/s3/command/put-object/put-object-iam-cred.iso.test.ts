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
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamInvalidCredentials } from "../../../iam/credential/error/sim-iam-credential.error.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";

describe("S3 PutObjectCommand IAM credential authorization", () => {
  it("allows IAM User credentials when the policy condition matches", async () => {
    // Given an IAM User permitted to write one Object as its own principal.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.region(region).s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "user-credential-writes" }),
    );
    const userOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "ConditionalObjectWriter",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "ConditionalObjectWriter",
        PolicyName: "WriteCurrentReport",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:PutObject",
            Resource:
              "arn:aws:s3:::user-credential-writes/reports/current.json",
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
        UserName: "ConditionalObjectWriter",
      }),
    );

    // When the User writes the authorized Object with its long-lived credentials.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "user-credential-writes",
        Key: "reports/current.json",
        Body: '{"status":"ready"}',
        Metadata: {
          source: "credential-test",
        },
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

    // Then IAM permits the write and the next S3 operation reads the stored Object.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "user-credential-writes",
        Key: "reports/current.json",
      }),
    );
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from('{"status":"ready"}'),
    );
    assertIdentical(output.Metadata?.["source"], "credential-test");
  });

  it("allows IAM User credentials through a Bucket resource policy", async () => {
    // Given a User without an identity policy and a Bucket policy granting one write.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.region(region).s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "resource-policy-writes" }),
    );
    const userOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "BucketPolicyWriter",
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "BucketPolicyWriter",
      }),
    );
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "resource-policy-writes",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: userOutput.User.Arn,
            },
            Action: "s3:PutObject",
            Resource: "arn:aws:s3:::resource-policy-writes/shared/document.txt",
          },
        }),
      }),
    );

    // When the User writes the Object with its long-lived credentials.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "resource-policy-writes",
        Key: "shared/document.txt",
        Body: "granted by the bucket policy",
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

    // Then the Bucket policy grants access and S3 stores the supplied body.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "resource-policy-writes",
        Key: "shared/document.txt",
      }),
    );
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from("granted by the bucket policy"),
    );
  });

  it("allows assumed Role credentials through the underlying Role policy", async () => {
    // Given an assumable Role permitted to write one Object.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.region(region).s3();
    const roleArn = `arn:aws:iam::${accountId}:role/TemporaryObjectWriter`;

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "temporary-credential-writes" }),
    );
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TemporaryObjectWriter",
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
        RoleName: "TemporaryObjectWriter",
        PolicyName: "WriteSessionDocument",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:PutObject",
            Resource:
              "arn:aws:s3:::temporary-credential-writes/documents/session.txt",
          },
        }),
      }),
    );
    const assumeRoleOutput = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "put-object-session",
      }),
    );
    const credentials = assumeRoleOutput.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    // When S3 receives the temporary access key, secret, and session token.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "temporary-credential-writes",
        Key: "documents/session.txt",
        Body: "written through an STS session",
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

    // Then the session resolves to the Role and S3 persists the Object.
    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "temporary-credential-writes",
        Key: "documents/session.txt",
      }),
    );
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from("written through an STS session"),
    );
  });

  it("denies valid User credentials without permission for the Object and retains existing content", async () => {
    // Given an existing Object and a User permitted to write only public Objects.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "credential-denied-writes" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "credential-denied-writes",
        Key: "private/secret.txt",
        Body: "original secret",
      }),
    );
    await simIam.createUser(
      new CreateUserCommand({
        UserName: "LimitedWriter",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "LimitedWriter",
        PolicyName: "WritePublicObjects",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:PutObject",
            Resource: "arn:aws:s3:::credential-denied-writes/public/*",
          },
        }),
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "LimitedWriter",
      }),
    );

    // When the authenticated User attempts to replace an Object outside its policy.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "credential-denied-writes",
          Key: "private/secret.txt",
          Body: "replacement secret",
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

    // Then IAM denies the exact Object resource before S3 mutates stored content.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:PutObject");
    assertIdentical(
      error.resource,
      "arn:aws:s3:::credential-denied-writes/private/secret.txt",
    );

    const output = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "credential-denied-writes",
        Key: "private/secret.txt",
      }),
    );
    assertInstanceOf(output.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body),
      Buffer.from("original secret"),
    );
  });

  it("rejects invalid credentials before creating an Object", async () => {
    // Given an existing Bucket and credentials containing an unknown access key.
    const simAws = new SimAws();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "credential-authentication-writes" }),
    );

    // When the invalid credentials attempt to write an Object.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "credential-authentication-writes",
          Key: "new.txt",
          Body: "must not be stored",
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

    // Then credential authentication fails before S3 authorizes or stores the Object.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "unknown-access-key");
  });
});

import {
  CreateAccessKeyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";

describe("S3 CreateBucketCommand IAM credential authorization", () => {
  it("allows IAM User access key credentials through the User policy", async () => {
    // Given an IAM User whose inline policy permits creation of one Bucket.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region(region).s3();

    await simIam.createUser(
      new CreateUserCommand({
        UserName: "BucketUser",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "BucketUser",
        PolicyName: "CreateCredentialBucket",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:CreateBucket",
            Resource: "arn:aws:s3:::user-credential-bucket",
          },
        }),
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "BucketUser",
      }),
    );

    // When the User supplies its long-lived access key credentials.
    const output = await simS3.createBucket(
      new CreateBucketCommand({
        Bucket: "user-credential-bucket",
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

    // Then IAM authenticates the User, applies its policy, and permits creation.
    assertIdentical(output.BucketArn, "arn:aws:s3:::user-credential-bucket");
    assertIdentical(
      simS3.findBucketScope("user-credential-bucket")?.regionName,
      region,
    );
  });

  it("allows assumed Role credentials through the underlying Role policy", async () => {
    // Given an assumable Role whose identity policy allows one Bucket.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.region(region).s3();
    const roleArn = `arn:aws:iam::${accountId}:role/CredentialBucketCreator`;

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "CredentialBucketCreator",
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
        RoleName: "CredentialBucketCreator",
        PolicyName: "CreateCredentialBucket",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:CreateBucket",
            Resource: "arn:aws:s3:::assumed-role-credential-bucket",
          },
        }),
      }),
    );

    const assumeRoleOutput = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "create-bucket-session",
      }),
    );
    const credentials = assumeRoleOutput.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    // When the temporary credentials are supplied as the S3 caller.
    const output = await simS3.createBucket(
      new CreateBucketCommand({
        Bucket: "assumed-role-credential-bucket",
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

    // Then the session is the effective caller while the Role policy allows
    // creation.
    assertIdentical(
      output.BucketArn,
      "arn:aws:s3:::assumed-role-credential-bucket",
    );
    assertIdentical(
      simS3.findBucketScope("assumed-role-credential-bucket")?.regionName,
      region,
    );
  });
});

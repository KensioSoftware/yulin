import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

describe("S3 PutBucketWebsiteCommand IAM authorization", () => {
  it("allows the default Account root caller", async () => {
    // Given an S3 Bucket in a simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "root-website-bucket" }),
    );

    // When PutBucketWebsite is called without an explicit caller.
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "root-website-bucket",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );

    // Then IAM defaults to Account root and the website integration is available.
    assertIdentical(
      simS3.getBucketWebsiteUrl("root-website-bucket").toString(),
      "http://root-website-bucket.s3-website.eu-west-2.sim-aws.localhost/",
    );
  });

  it("allows a Role when its action, resource, and condition match", async () => {
    // Given a Role allowed to configure one Bucket when its principal ARN matches.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-west-1").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "conditional-website-bucket" }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "WebsiteConfigurator",
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
        RoleName: "WebsiteConfigurator",
        PolicyName: "ConfigureConditionalWebsite",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:PutBucketWebsite",
            Resource: "arn:aws:s3:::conditional-website-bucket",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role configures the specifically authorized Bucket.
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "conditional-website-bucket",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "home.html",
          },
        },
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then the configuration reaches the Bucket website request mapping.
    const bucket = simS3.getSimBucketByName("conditional-website-bucket");
    assertNonNullable(bucket);
    assertIdentical(
      bucket.getWebsite().objectKeyForRequest("documentation/"),
      "documentation/home.html",
    );
  });

  it("implicitly denies a Role when its policy condition does not match", async () => {
    // Given a Role policy conditioned on a different principal ARN.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-central-1").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "condition-denied-website" }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchConfigurator",
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
        RoleName: "ConditionMismatchConfigurator",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:PutBucketWebsite",
            Resource: "arn:aws:s3:::condition-denied-website",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role attempts to configure the otherwise matching Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketWebsite(
        new PutBucketWebsiteCommand({
          Bucket: "condition-denied-website",
          WebsiteConfiguration: {
            IndexDocument: {
              Suffix: "index.html",
            },
          },
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then IAM reports the effective request and leaves website hosting disabled.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:PutBucketWebsite");
    assertIdentical(error.resource, "arn:aws:s3:::condition-denied-website");

    const bucket = simS3.getSimBucketByName("condition-denied-website");
    assertNonNullable(bucket);
    assertFalse(bucket.getWebsite().websiteEnabled());
  });

  it("applies an explicit Deny before replacing website configuration", async () => {
    // Given a configured Bucket and a Role with a broad Allow plus a targeted Deny.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("us-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "protected-website-bucket" }),
    );
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "protected-website-bucket",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "original.html",
          },
        },
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "RestrictedWebsiteConfigurator",
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
        RoleName: "RestrictedWebsiteConfigurator",
        PolicyName: "RestrictedWebsiteConfiguration",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:PutBucketWebsite",
              Resource: "arn:aws:s3:::*",
            },
            {
              Effect: "Deny",
              Action: "s3:PutBucketWebsite",
              Resource: "arn:aws:s3:::protected-website-bucket",
            },
          ],
        }),
      }),
    );

    // When the Role attempts to replace the protected Bucket configuration.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketWebsite(
        new PutBucketWebsiteCommand({
          Bucket: "protected-website-bucket",
          WebsiteConfiguration: {
            ErrorDocument: {
              Key: "replacement-error.html",
            },
          },
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then the explicit Deny wins and the existing configuration remains active.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(
      error.message,
      `User: ${roleArn} is not authorized to perform: s3:PutBucketWebsite on resource: arn:aws:s3:::protected-website-bucket`,
    );

    const bucket = simS3.getSimBucketByName("protected-website-bucket");
    assertNonNullable(bucket);
    assertIdentical(
      bucket.getWebsite().objectKeyForRequest("docs/"),
      "docs/original.html",
    );
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given an existing Bucket where an omitted caller would default to root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simS3 = simAws.account(accountId).region("ap-southeast-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "anonymous-website-bucket" }),
    );

    // When an explicitly anonymous caller attempts to configure its website.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketWebsite(
        new PutBucketWebsiteCommand({
          Bucket: "anonymous-website-bucket",
          WebsiteConfiguration: {
            IndexDocument: {
              Suffix: "index.html",
            },
          },
        }),
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then IAM preserves anonymity, denies access, and does not mutate the
    // Bucket.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);

    const bucket = simS3.getSimBucketByName("anonymous-website-bucket");
    assertNonNullable(bucket);
    assertFalse(bucket.getWebsite().websiteEnabled());

    // And the next root request can configure and use the same website.
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "anonymous-website-bucket",
        WebsiteConfiguration: {
          RedirectAllRequestsTo: {
            HostName: "example.test",
            Protocol: "https",
          },
        },
      }),
    );
    assertTrue(bucket.getWebsite().redirectsAllRequests());
  });
});

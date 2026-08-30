import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  PutObjectLockConfigurationCommand,
  PutObjectRetentionCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { ObjectLockRetentionMode } from "@aws-sdk/client-s3";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimS3 } from "../../sim-s3.js";

const bucketName = "reader-history";
const key = "events/reader-1.json";
const bucketArn = `arn:aws:s3:::${bucketName}`;

const assumedByAccountRoot = (accountId: string): string =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Principal: { AWS: `arn:aws:iam::${accountId}:root` },
      Action: "sts:AssumeRole",
    },
  });

/**
 * A Role allowed to do everything the tests below ask for, apart from what
 * each test leaves out of `actions`.
 */
async function roleAllowing(
  simAws: SimAws,
  accountId: string,
  actions: readonly string[],
): Promise<string> {
  const simIam = simAws.account(accountId).iam();
  const created = await simIam.createRole(
    new CreateRoleCommand({
      RoleName: "HistoryKeeper",
      AssumeRolePolicyDocument: assumedByAccountRoot(accountId),
    }),
  );

  await simIam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "HistoryKeeper",
      PolicyName: "KeepHistory",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: actions,
          Resource: [bucketArn, `${bucketArn}/*`],
        },
      }),
    }),
  );

  return created.Role.Arn;
}

/**
 * A locked Bucket holding one retained version, and the id of that version.
 */
async function retainedVersion(
  s3: SimS3,
  simAws: SimAws,
  mode: ObjectLockRetentionMode,
): Promise<string> {
  await s3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await s3.putBucketVersioning(
    new PutBucketVersioningCommand({
      Bucket: bucketName,
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );
  await s3.putObjectLockConfiguration(
    new PutObjectLockConfigurationCommand({
      Bucket: bucketName,
      ObjectLockConfiguration: { ObjectLockEnabled: "Enabled" },
    }),
  );

  const put = await s3.putObject(
    new PutObjectCommand({ Bucket: bucketName, Key: key, Body: "one" }),
  );
  assertNonNullable(put.VersionId);

  const retainUntil = new Date(simAws.clock().now().getTime() + 3_600_000);

  await s3.putObjectRetention(
    new PutObjectRetentionCommand({
      Bucket: bucketName,
      Key: key,
      VersionId: put.VersionId,
      Retention: { Mode: mode, RetainUntilDate: retainUntil },
    }),
  );

  return put.VersionId;
}

describe("S3 Object Lock governance bypass", () => {
  it("lets a caller holding the bypass permission through", async () => {
    // Given a version under a governance retention, and a Role allowed to
    // delete it and to bypass governance.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const s3 = simAws.account(accountId).region("eu-west-2").s3();
    const VersionId = await retainedVersion(s3, simAws, "GOVERNANCE");
    const roleArn = await roleAllowing(simAws, accountId, [
      "s3:DeleteObject",
      "s3:BypassGovernanceRetention",
    ]);

    // When it deletes the version, naming the bypass.
    const deleted = await s3.deleteObject(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
        VersionId,
        BypassGovernanceRetention: true,
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then the version is gone, inside its retention period.
    assertIdentical(deleted.VersionId, VersionId);
  });

  it("refuses the same caller a compliance retention", async () => {
    // Given the same Role and the same permissions, over a version under a
    // compliance retention rather than a governance one.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const s3 = simAws.account(accountId).region("eu-west-2").s3();
    const VersionId = await retainedVersion(s3, simAws, "COMPLIANCE");
    const roleArn = await roleAllowing(simAws, accountId, [
      "s3:DeleteObject",
      "s3:BypassGovernanceRetention",
    ]);

    // When it deletes the version, naming the bypass, then it is refused.
    // Compliance is the mode nobody can get out of, which is what makes it
    // worth having.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.deleteObject(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: key,
          VersionId,
          BypassGovernanceRetention: true,
        }),
        { caller: { kind: "arn", arn: roleArn } },
      );
    });

    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "COMPLIANCE retention period");
  });

  it("refuses a caller that may delete but may not bypass", async () => {
    // Given a Role allowed to delete Objects and nothing more.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const s3 = simAws.account(accountId).region("eu-west-2").s3();
    const VersionId = await retainedVersion(s3, simAws, "GOVERNANCE");
    const roleArn = await roleAllowing(simAws, accountId, ["s3:DeleteObject"]);

    // When it names the bypass, then IAM refuses it, because bypassing is a
    // permission of its own alongside the delete.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.deleteObject(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: key,
          VersionId,
          BypassGovernanceRetention: true,
        }),
        { caller: { kind: "arn", arn: roleArn } },
      );
    });

    assertStringIncludes(error.message, "s3:BypassGovernanceRetention");
  });

  it("refuses a governance retention the request does not bypass", async () => {
    // Given the same Role, holding both permissions.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const s3 = simAws.account(accountId).region("eu-west-2").s3();
    const VersionId = await retainedVersion(s3, simAws, "GOVERNANCE");
    const roleArn = await roleAllowing(simAws, accountId, [
      "s3:DeleteObject",
      "s3:BypassGovernanceRetention",
    ]);

    // When it deletes the version without naming the bypass, then the
    // retention holds. Holding the permission is not the same as using it.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.deleteObject(
        new DeleteObjectCommand({ Bucket: bucketName, Key: key, VersionId }),
        { caller: { kind: "arn", arn: roleArn } },
      );
    });

    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "GOVERNANCE retention period");
  });
});

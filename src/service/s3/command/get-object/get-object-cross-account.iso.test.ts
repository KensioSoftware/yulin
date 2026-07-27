import {
  CreateBucketCommand,
  GetObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { createSimIamRoleWithPolicy } from "../../../../../test/iam/create-role-with-policy.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3 } from "../../sim-s3.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";

const ownerAccountId = "111111111111";
const callerAccountId = "222222222222";
const callerRoleArn = `arn:aws:iam::${callerAccountId}:role/Reader`;

/**
 * A Bucket in one Account holding one Object, with a Bucket policy granting the
 * other Account's Role read access to it.
 */
async function grantingBucket(simAws: SimAws): Promise<SimS3> {
  const simS3 = simAws.account(ownerAccountId).s3();

  await simS3.createBucket(
    new CreateBucketCommand({ Bucket: "shared-reports" }),
  );
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "shared-reports",
      Key: "summary.csv",
      Body: "period,total\n2026-07,42\n",
    }),
  );
  await simS3.putBucketPolicy(
    new PutBucketPolicyCommand({
      Bucket: "shared-reports",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: callerRoleArn },
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::shared-reports/*",
        },
      }),
    }),
  );

  return simS3;
}

/**
 * The reading Role in its own Account, allowed to read the Object there.
 */
async function allowedReaderRole(simAws: SimAws): Promise<void> {
  await createSimIamRoleWithPolicy({
    simAws,
    accountId: callerAccountId,
    roleName: "Reader",
    policyName: "ReadSharedReports",
    action: "s3:GetObject",
    resource: "arn:aws:s3:::shared-reports/*",
  });
}

describe("S3 GetObjectCommand cross-Account Bucket policy", () => {
  it("refuses a Role its own Account does not allow", async () => {
    // Given a Bucket policy granting another Account's Role, with nothing in
    // that Account allowing it
    const simAws = new SimAws();
    const simS3 = await grantingBucket(simAws);
    simAws.account(callerAccountId).iam();

    // When that Role reads the Object
    // Then it is denied: real AWS requires the caller's Account to allow the
    // action as well as the Bucket policy
    const error = await assertThrowsErrorAsync(
      async () =>
        await simS3.getObject(
          new GetObjectCommand({
            Bucket: "shared-reports",
            Key: "summary.csv",
          }),
          { caller: { kind: "arn", arn: callerRoleArn } },
        ),
    );
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("reads the Object when both Accounts allow it", async () => {
    // Given the same Bucket policy, and an identity policy for the Role in its
    // own Account
    const simAws = new SimAws();
    const simS3 = await grantingBucket(simAws);
    await allowedReaderRole(simAws);

    // When that Role reads the Object
    const output = await simS3.getObject(
      new GetObjectCommand({ Bucket: "shared-reports", Key: "summary.csv" }),
      { caller: { kind: "arn", arn: callerRoleArn } },
    );

    // Then the read succeeds, with an allow from each Account
    assertNonNullable(output.Body);
    const body = await simS3BodyToBuffer(output.Body);
    assertIdentical(body.toString("utf8"), "period,total\n2026-07,42\n");
  });
});

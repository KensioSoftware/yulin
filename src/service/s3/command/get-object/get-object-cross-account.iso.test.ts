import {
  CreateBucketCommand,
  GetObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";

const ownerAccountId = "111111111111";
const callerAccountId = "222222222222";
const callerRoleArn = `arn:aws:iam::${callerAccountId}:role/Reader`;

const reportContent = "period,total\n2026-07,42\n";

describe("S3 GetObjectCommand cross-Account Bucket policy", () => {
  it("refuses a Role its own Account does not allow", async () => {
    // Given a Bucket in one Account holding one Object
    const simAws = new SimAws();
    const simS3 = simAws.account(ownerAccountId).s3();
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "shared-reports" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "shared-reports",
        Key: "summary.csv",
        Body: reportContent,
      }),
    );

    // And a Bucket policy granting another Account's Role read access
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "shared-reports",
        Policy: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: callerRoleArn },
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::shared-reports/*",
          },
        }),
      }),
    );

    // And nothing in that Role's own Account allowing it
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
    // Given a Bucket in one Account holding one Object
    const simAws = new SimAws();
    const simS3 = simAws.account(ownerAccountId).s3();
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "shared-reports" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "shared-reports",
        Key: "summary.csv",
        Body: reportContent,
      }),
    );

    // And a Bucket policy granting another Account's Role read access
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "shared-reports",
        Policy: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: callerRoleArn },
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::shared-reports/*",
          },
        }),
      }),
    );

    // And an identity policy for that Role in its own Account
    const callerIam = simAws.account(callerAccountId).iam();
    await callerIam.createRole(
      new CreateRoleCommand({
        RoleName: "Reader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${callerAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await callerIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Reader",
        PolicyName: "ReadSharedReports",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::shared-reports/*",
          },
        }),
      }),
    );

    // When that Role reads the Object
    const output = await simS3.getObject(
      new GetObjectCommand({ Bucket: "shared-reports", Key: "summary.csv" }),
      { caller: { kind: "arn", arn: callerRoleArn } },
    );

    // Then the read succeeds, with an allow from each Account
    assertNonNullable(output.Body);
    const body = await simS3BodyToBuffer(output.Body);
    assertIdentical(body.toString("utf8"), reportContent);
  });
});

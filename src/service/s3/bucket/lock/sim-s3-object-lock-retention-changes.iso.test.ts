import {
  CreateBucketCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  PutObjectLockConfigurationCommand,
  PutObjectRetentionCommand,
} from "@aws-sdk/client-s3";
import {
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimS3 } from "../../sim-s3.js";

const bucketName = "reader-history";
const key = "events/reader-1.json";
const anHour = 3_600_000;

/** A locked Bucket holding one version, which is what a retention goes on. */
async function bucketHoldingOneVersion(
  simAws: SimAws,
): Promise<{ s3: SimS3; versionId: string }> {
  const s3 = simAws.s3();

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

  return { s3, versionId: put.VersionId };
}

describe("changing an S3 Object Lock retention period", () => {
  it("extends a compliance retention and refuses to shorten one", async () => {
    // Given a version retained for two hours in compliance mode.
    const simAws = new SimAws();
    const { s3, versionId } = await bucketHoldingOneVersion(simAws);
    const now = simAws.clock().now().getTime();

    async function retainFor(hours: number): Promise<void> {
      await s3.putObjectRetention(
        new PutObjectRetentionCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: versionId,
          Retention: {
            Mode: "COMPLIANCE",
            RetainUntilDate: new Date(now + hours * anHour),
          },
          BypassGovernanceRetention: true,
        }),
      );
    }

    await retainFor(2);

    // When it is extended, that is allowed.
    await retainFor(3);

    // And when it is shortened, that is refused, whoever asks and whatever
    // they bypass.
    const error = await assertThrowsErrorAsync(async () => {
      await retainFor(1);
    });

    assertStringIncludes(
      error.message,
      "COMPLIANCE retention period can only be extended in the same mode",
    );
  });
  it("refuses to turn a compliance retention into a governance one", async () => {
    // Given a version retained for two hours in compliance mode.
    const simAws = new SimAws();
    const { s3, versionId } = await bucketHoldingOneVersion(simAws);
    const now = simAws.clock().now().getTime();

    await s3.putObjectRetention(
      new PutObjectRetentionCommand({
        Bucket: bucketName,
        Key: key,
        VersionId: versionId,
        Retention: {
          Mode: "COMPLIANCE",
          RetainUntilDate: new Date(now + 2 * anHour),
        },
      }),
    );

    // When a longer governance retention is put over it, then it is refused.
    // Taking the mode down to governance would hand the version to the first
    // caller holding the bypass permission, which is the guarantee gone.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.putObjectRetention(
        new PutObjectRetentionCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: versionId,
          Retention: {
            Mode: "GOVERNANCE",
            RetainUntilDate: new Date(now + 3 * anHour),
          },
          BypassGovernanceRetention: true,
        }),
      );
    });

    assertStringIncludes(
      error.message,
      "never shortened or turned into a GOVERNANCE one",
    );
  });
  it("shortens a governance retention only for a request that bypasses", async () => {
    // Given a version retained for two hours in governance mode.
    const simAws = new SimAws();
    const { s3, versionId } = await bucketHoldingOneVersion(simAws);
    const now = simAws.clock().now().getTime();

    async function retainFor(hours: number, bypass = false): Promise<void> {
      await s3.putObjectRetention(
        new PutObjectRetentionCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: versionId,
          Retention: {
            Mode: "GOVERNANCE",
            RetainUntilDate: new Date(now + hours * anHour),
          },
          BypassGovernanceRetention: bypass,
        }),
      );
    }

    await retainFor(2);

    // When it is shortened without a bypass, then it is refused.
    const error = await assertThrowsErrorAsync(async () => {
      await retainFor(1);
    });

    assertStringIncludes(error.message, "requires BypassGovernanceRetention");

    // And with one, it goes through.
    await retainFor(1, true);
  });
});

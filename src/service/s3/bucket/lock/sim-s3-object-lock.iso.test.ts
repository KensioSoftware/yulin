import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectLockConfigurationCommand,
  HeadObjectCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  PutObjectLegalHoldCommand,
  PutObjectLockConfigurationCommand,
  PutObjectRetentionCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import type { SimS3 } from "../../sim-s3.js";

const bucketName = "reader-history";
const key = "events/reader-1/2026-08-30.json";

/**
 * A versioned Bucket with Object Lock on, and no default retention.
 *
 * Object Lock holds a version, so every test needs versioning underneath it.
 */
async function lockedBucket(simAws: SimAws, days?: number): Promise<SimS3> {
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
      ObjectLockConfiguration: {
        ObjectLockEnabled: "Enabled",
        ...(days !== undefined && {
          Rule: { DefaultRetention: { Mode: "GOVERNANCE", Days: days } },
        }),
      },
    }),
  );

  return s3;
}

/** Write one version of the reader's history, answering its version id. */
async function putEvent(s3: SimS3, body = "one"): Promise<string> {
  const put = await s3.putObject(
    new PutObjectCommand({ Bucket: bucketName, Key: key, Body: body }),
  );

  assertNonNullable(put.VersionId);

  return put.VersionId;
}

describe("S3 Object Lock", () => {
  it("reports the configuration a Bucket was locked with", async () => {
    // Given a Bucket locked with a default retention.
    const simAws = new SimAws();
    const s3 = await lockedBucket(simAws, 30);

    // When the configuration is read back.
    const read = await s3.getObjectLockConfiguration(
      new GetObjectLockConfigurationCommand({ Bucket: bucketName }),
    );

    // Then it answers with what was set.
    assertIdentical(read.ObjectLockConfiguration.ObjectLockEnabled, "Enabled");

    const defaults = read.ObjectLockConfiguration.Rule?.DefaultRetention;
    assertNonNullable(defaults);
    assertIdentical(defaults.Mode, "GOVERNANCE");
    assertIdentical(defaults.Days, 30);
  });

  it("refuses Object Lock on a Bucket that keeps no versions", async () => {
    // Given a Bucket nobody turned versioning on for.
    const simAws = new SimAws();
    const s3 = simAws.s3();
    await s3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    // When Object Lock is turned on, then it is refused, because Object Lock
    // holds a version and this Bucket holds none.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.putObjectLockConfiguration(
        new PutObjectLockConfigurationCommand({
          Bucket: bucketName,
          ObjectLockConfiguration: { ObjectLockEnabled: "Enabled" },
        }),
      );
    });

    assertIdentical(error.name, "InvalidBucketState");
    assertStringIncludes(error.message, "does not have versioning enabled");
  });

  it("retains a version until the clock passes the retention", async () => {
    // Given a version under a compliance retention of one hour.
    const simAws = new SimAws();
    const s3 = await lockedBucket(simAws);
    const VersionId = await putEvent(s3);
    const retainUntil = new Date(simAws.clock().now().getTime() + 3_600_000);

    await s3.putObjectRetention(
      new PutObjectRetentionCommand({
        Bucket: bucketName,
        Key: key,
        VersionId,
        Retention: { Mode: "COMPLIANCE", RetainUntilDate: retainUntil },
      }),
    );

    // When the version is deleted, then it is refused.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.deleteObject(
        new DeleteObjectCommand({ Bucket: bucketName, Key: key, VersionId }),
      );
    });

    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "COMPLIANCE retention period");

    // And once simulated time passes the retention, the delete goes through.
    await simAws.clock().advanceBy({ hours: 2 });

    await s3.deleteObject(
      new DeleteObjectCommand({ Bucket: bucketName, Key: key, VersionId }),
    );

    assertUndefined(
      simAws
        .s3()
        .getSimBucketByName(bucketName)
        ?.getVersions()
        .find(key, VersionId),
    );
  });

  it("reports the retention a read of the version finds", async () => {
    // Given a version under a governance retention.
    const simAws = new SimAws();
    const s3 = await lockedBucket(simAws);
    const VersionId = await putEvent(s3);
    const retainUntil = new Date(simAws.clock().now().getTime() + 3_600_000);

    await s3.putObjectRetention(
      new PutObjectRetentionCommand({
        Bucket: bucketName,
        Key: key,
        VersionId,
        Retention: { Mode: "GOVERNANCE", RetainUntilDate: retainUntil },
      }),
    );

    // When the version is described.
    const head = await s3.headObject(
      new HeadObjectCommand({ Bucket: bucketName, Key: key, VersionId }),
    );

    // Then the lock is reported alongside everything else about it.
    assertIdentical(head.ObjectLockMode, "GOVERNANCE");
    assertIdentical(
      head.ObjectLockRetainUntilDate?.toISOString(),
      retainUntil.toISOString(),
    );
    assertUndefined(head.ObjectLockLegalHoldStatus);
  });

  it("holds a version for as long as its legal hold is on", async () => {
    // Given a version under a legal hold and no retention period.
    const simAws = new SimAws();
    const s3 = await lockedBucket(simAws);
    const VersionId = await putEvent(s3);

    await s3.putObjectLegalHold(
      new PutObjectLegalHoldCommand({
        Bucket: bucketName,
        Key: key,
        VersionId,
        LegalHold: { Status: "ON" },
      }),
    );

    // When the version is deleted a year later, then it is still refused,
    // because a hold has no period to wait out.
    await simAws.clock().advanceBy({ days: 365 });

    const error = await assertThrowsErrorAsync(async () => {
      return await s3.deleteObject(
        new DeleteObjectCommand({ Bucket: bucketName, Key: key, VersionId }),
      );
    });

    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "legal hold");

    // And a read of the version says the hold is what is on it.
    const held = await s3.headObject(
      new HeadObjectCommand({ Bucket: bucketName, Key: key, VersionId }),
    );
    assertIdentical(held.ObjectLockLegalHoldStatus, "ON");
    assertUndefined(held.ObjectLockMode);

    // And taking the hold off is what lets the version go.
    await s3.putObjectLegalHold(
      new PutObjectLegalHoldCommand({
        Bucket: bucketName,
        Key: key,
        VersionId,
        LegalHold: { Status: "OFF" },
      }),
    );

    await s3.deleteObject(
      new DeleteObjectCommand({ Bucket: bucketName, Key: key, VersionId }),
    );
  });

  it("refuses a retention that runs until no instant in particular", async () => {
    // Given a locked Bucket holding one version.
    const simAws = new SimAws();
    const s3 = await lockedBucket(simAws);
    const VersionId = await putEvent(s3);

    // When it is retained until something that is not a date, then it is
    // refused rather than held until an instant nobody can work out.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.putObjectRetention(
        new PutObjectRetentionCommand({
          Bucket: bucketName,
          Key: key,
          VersionId,
          Retention: {
            Mode: "GOVERNANCE",
            RetainUntilDate: new Date("the end of time"),
          },
        }),
      );
    });

    assertStringIncludes(error.message, "is not a date");
  });

  it("refuses a retention on a key holding nothing", async () => {
    // Given a locked Bucket that has never been written to.
    const simAws = new SimAws();
    const s3 = await lockedBucket(simAws);
    const retainUntil = new Date(simAws.clock().now().getTime() + 3_600_000);

    // When its current version is retained, then there is none to retain.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.putObjectRetention(
        new PutObjectRetentionCommand({
          Bucket: bucketName,
          Key: key,
          Retention: { Mode: "GOVERNANCE", RetainUntilDate: retainUntil },
        }),
      );
    });

    assertIdentical(error.name, "NoSuchKey");
  });

  it("refuses a legal hold on a delete marker", async () => {
    // Given a locked Bucket whose current version is a delete marker.
    const simAws = new SimAws();
    const s3 = await lockedBucket(simAws);
    await putEvent(s3);
    await s3.deleteObject(
      new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
    );

    // When a hold is put on the current version, then it is refused. A marker
    // holds no bytes, so there is nothing for a hold to keep.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.putObjectLegalHold(
        new PutObjectLegalHoldCommand({
          Bucket: bucketName,
          Key: key,
          LegalHold: { Status: "ON" },
        }),
      );
    });

    assertIdentical(error.name, "MethodNotAllowed");
  });

  it("retains a version the Bucket's default retention covers", async () => {
    // Given a Bucket with a thirty day default retention.
    const writtenAt = new Date("2026-08-30T09:00:00.000Z");
    const simAws = new SimAws({ clock: new SimFixedClock(writtenAt) });
    const s3 = await lockedBucket(simAws, 30);

    // When a version is written.
    const VersionId = await putEvent(s3);

    // Then it is retained for thirty days counted from the write.
    const head = await s3.headObject(
      new HeadObjectCommand({ Bucket: bucketName, Key: key, VersionId }),
    );

    assertIdentical(head.ObjectLockMode, "GOVERNANCE");
    assertIdentical(
      head.ObjectLockRetainUntilDate?.getTime(),
      writtenAt.getTime() + 30 * 86_400_000,
    );
  });
});

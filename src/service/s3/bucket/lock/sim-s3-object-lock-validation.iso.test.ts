import {
  CreateBucketCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  PutObjectLegalHoldCommand,
  PutObjectLockConfigurationCommand,
  PutObjectRetentionCommand,
} from "@aws-sdk/client-s3";
import type { ObjectLockConfiguration } from "@aws-sdk/client-s3";
import {
  assertIdentical,
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

/** A versioned Bucket, locked or not, holding one version of one key. */
async function bucketHoldingOneVersion(
  simAws: SimAws,
  locked: boolean,
): Promise<{ s3: SimS3; versionId: string }> {
  const s3 = simAws.s3();

  await s3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await s3.putBucketVersioning(
    new PutBucketVersioningCommand({
      Bucket: bucketName,
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );

  if (locked) {
    await s3.putObjectLockConfiguration(
      new PutObjectLockConfigurationCommand({
        Bucket: bucketName,
        ObjectLockConfiguration: { ObjectLockEnabled: "Enabled" },
      }),
    );
  }

  const put = await s3.putObject(
    new PutObjectCommand({ Bucket: bucketName, Key: key, Body: "one" }),
  );
  assertNonNullable(put.VersionId);

  return { s3, versionId: put.VersionId };
}

/** Whatever locking a Bucket with this configuration is refused with. */
async function lockRefusal(
  configuration: ObjectLockConfiguration,
): Promise<Error> {
  const simAws = new SimAws();
  const s3 = simAws.s3();

  await s3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await s3.putBucketVersioning(
    new PutBucketVersioningCommand({
      Bucket: bucketName,
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );

  return await assertThrowsErrorAsync(async () => {
    return await s3.putObjectLockConfiguration(
      new PutObjectLockConfigurationCommand({
        Bucket: bucketName,
        ObjectLockConfiguration: configuration,
      }),
    );
  });
}

describe("S3 Object Lock validation", () => {
  it("refuses a configuration that is not enabled", async () => {
    // Given a configuration saying Object Lock is off, which real S3 has no
    // request for. When it is applied, then it is refused.
    const error = await lockRefusal({
      ObjectLockEnabled: "Disabled" as "Enabled",
    });

    assertIdentical(error.name, "InvalidRequest");
    assertStringIncludes(error.message, "ObjectLockEnabled has to be Enabled");
  });

  it("refuses a default retention with both Days and Years", async () => {
    // Given a default retention measured two ways at once.
    // When it is applied, then it is refused, since the two disagree about
    // how long a version is held.
    const error = await lockRefusal({
      ObjectLockEnabled: "Enabled",
      Rule: { DefaultRetention: { Mode: "GOVERNANCE", Days: 1, Years: 1 } },
    });

    assertStringIncludes(error.message, "requires either Days or Years");
  });

  it("refuses a default retention measured neither way", async () => {
    // Given a default retention with a mode and no period.
    const error = await lockRefusal({
      ObjectLockEnabled: "Enabled",
      Rule: { DefaultRetention: { Mode: "GOVERNANCE" } },
    });

    assertStringIncludes(error.message, "requires either Days or Years");
  });

  it("refuses a default retention period that is not a whole number", async () => {
    // Given half a day, which real S3 measures nothing in.
    const error = await lockRefusal({
      ObjectLockEnabled: "Enabled",
      Rule: { DefaultRetention: { Mode: "GOVERNANCE", Days: 0.5 } },
    });

    assertStringIncludes(
      error.message,
      "has to be a whole number of at least 1",
    );
  });

  it("refuses a default retention in a mode real S3 has no name for", async () => {
    // Given a mode that is neither of the two.
    const error = await lockRefusal({
      ObjectLockEnabled: "Enabled",
      Rule: { DefaultRetention: { Mode: "STRICT" as "GOVERNANCE", Days: 1 } },
    });

    assertStringIncludes(
      error.message,
      "DefaultRetention Mode has to be GOVERNANCE or COMPLIANCE",
    );
  });

  it("refuses a retention on a Bucket nobody locked", async () => {
    // Given a versioned Bucket with Object Lock off.
    const simAws = new SimAws();
    const { s3, versionId } = await bucketHoldingOneVersion(simAws, false);
    const retainUntil = new Date(simAws.clock().now().getTime() + anHour);

    // When a version is retained, then it is refused. A retention that
    // appeared to apply would report a guarantee nothing was enforcing.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.putObjectRetention(
        new PutObjectRetentionCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: versionId,
          Retention: {
            Mode: "COMPLIANCE",
            RetainUntilDate: retainUntil,
          },
        }),
      );
    });

    assertStringIncludes(error.message, "does not have Object Lock enabled");
  });

  it("refuses a retention naming a version the Bucket never issued", async () => {
    // Given a locked Bucket holding one version.
    const simAws = new SimAws();
    const { s3 } = await bucketHoldingOneVersion(simAws, true);
    const retainUntil = new Date(simAws.clock().now().getTime() + anHour);

    // When another version is retained, then it is refused as missing.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.putObjectRetention(
        new PutObjectRetentionCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: "never-issued",
          Retention: {
            Mode: "COMPLIANCE",
            RetainUntilDate: retainUntil,
          },
        }),
      );
    });

    assertIdentical(error.name, "NoSuchVersion");
  });

  it("refuses a retention in a mode real S3 has no name for", async () => {
    // Given a locked Bucket holding one version.
    const simAws = new SimAws();
    const { s3, versionId } = await bucketHoldingOneVersion(simAws, true);
    const retainUntil = new Date(simAws.clock().now().getTime() + anHour);

    // When it is retained in some third mode, then it is refused.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.putObjectRetention(
        new PutObjectRetentionCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: versionId,
          Retention: {
            Mode: "STRICT" as "GOVERNANCE",
            RetainUntilDate: retainUntil,
          },
        }),
      );
    });

    assertStringIncludes(
      error.message,
      "retention Mode has to be GOVERNANCE or COMPLIANCE",
    );
  });

  it("refuses a retention with no instant to run until", async () => {
    // Given a locked Bucket holding one version.
    const simAws = new SimAws();
    const { s3, versionId } = await bucketHoldingOneVersion(simAws, true);

    // When it is retained with no RetainUntilDate, then it is refused rather
    // than held until an instant nobody named.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.putObjectRetention(
        new PutObjectRetentionCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: versionId,
          Retention: { Mode: "GOVERNANCE" },
        }),
      );
    });

    assertStringIncludes(error.message, "requires a RetainUntilDate");
  });

  it("refuses a legal hold that is neither on nor off", async () => {
    // Given a locked Bucket holding one version.
    const simAws = new SimAws();
    const { s3, versionId } = await bucketHoldingOneVersion(simAws, true);

    // When the hold is set to something else, then it is refused.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.putObjectLegalHold(
        new PutObjectLegalHoldCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: versionId,
          LegalHold: { Status: "MAYBE" as "ON" },
        }),
      );
    });

    assertStringIncludes(
      error.message,
      "legal hold Status has to be ON or OFF",
    );
  });

  it("extends a compliance retention and refuses to shorten one", async () => {
    // Given a version retained for two hours in compliance mode.
    const simAws = new SimAws();
    const { s3, versionId } = await bucketHoldingOneVersion(simAws, true);
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
      "COMPLIANCE retention period can be extended and never shortened",
    );
  });

  it("shortens a governance retention only for a request that bypasses", async () => {
    // Given a version retained for two hours in governance mode.
    const simAws = new SimAws();
    const { s3, versionId } = await bucketHoldingOneVersion(simAws, true);
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

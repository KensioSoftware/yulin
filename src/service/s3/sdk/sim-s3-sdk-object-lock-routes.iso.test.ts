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
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";

const bucketName = "reader-history";
const key = "events/reader-1.json";

describe("simulated S3 Object Lock SDK Command routing", () => {
  it("locks, retains and holds through an intercepted client", async () => {
    // Given an intercepted S3 client and a versioned Bucket.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutBucketVersioningCommand({
        Bucket: bucketName,
        VersioningConfiguration: { Status: "Enabled" },
      }),
    );

    // When every Object Lock command is sent through it.
    await client.send(
      new PutObjectLockConfigurationCommand({
        Bucket: bucketName,
        ObjectLockConfiguration: { ObjectLockEnabled: "Enabled" },
      }),
    );

    const locking = await client.send(
      new GetObjectLockConfigurationCommand({ Bucket: bucketName }),
    );
    assertIdentical(
      locking.ObjectLockConfiguration?.ObjectLockEnabled,
      "Enabled",
    );

    const put = await client.send(
      new PutObjectCommand({ Bucket: bucketName, Key: key, Body: "one" }),
    );
    assertNonNullable(put.VersionId);

    const retainUntil = new Date(Date.now() + 3_600_000);
    await client.send(
      new PutObjectRetentionCommand({
        Bucket: bucketName,
        Key: key,
        VersionId: put.VersionId,
        Retention: { Mode: "GOVERNANCE", RetainUntilDate: retainUntil },
      }),
    );

    await client.send(
      new PutObjectLegalHoldCommand({
        Bucket: bucketName,
        Key: key,
        VersionId: put.VersionId,
        LegalHold: { Status: "ON" },
      }),
    );

    // Then the version reports both, and nothing can delete it.
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
        VersionId: put.VersionId,
      }),
    );

    assertIdentical(head.ObjectLockMode, "GOVERNANCE");
    assertIdentical(head.ObjectLockLegalHoldStatus, "ON");

    const error = await assertThrowsErrorAsync(async () => {
      return await client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: put.VersionId,
          BypassGovernanceRetention: true,
        }),
      );
    });

    assertIdentical(error.name, "AccessDenied");
  });
});

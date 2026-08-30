import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

/**
 * A versioned Bucket holding one version of each key given.
 */
async function bucketHolding(keys: readonly string[]): Promise<SimAws> {
  const simAws = new SimAws();
  const s3 = simAws.s3();

  await s3.createBucket(new CreateBucketCommand({ Bucket: "history" }));
  await s3.putBucketVersioning(
    new PutBucketVersioningCommand({
      Bucket: "history",
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );
  await Promise.all(
    keys.map(
      async (key) =>
        await s3.putObject(
          new PutObjectCommand({ Bucket: "history", Key: key, Body: key }),
        ),
    ),
  );

  return simAws;
}

describe("Listing the versions a simulated S3 Bucket holds", () => {
  it("truncates a page and resumes after the version it ended on", async () => {
    // Given a versioned Bucket holding three keys
    const simAws = await bucketHolding(["a.txt", "b.txt", "c.txt"]);
    const s3 = simAws.s3();

    // When they are listed two at a time
    const first = await s3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: "history", MaxKeys: 2 }),
    );
    const second = await s3.listObjectVersions(
      new ListObjectVersionsCommand({
        Bucket: "history",
        MaxKeys: 2,
        KeyMarker: first.NextKeyMarker,
        VersionIdMarker: first.NextVersionIdMarker,
      }),
    );

    // Then the first page says where the second resumes, and the second
    // carries the rest and stops.
    assertArrayLength(first.Versions ?? [], 2);
    assertTrue(first.IsTruncated);
    assertIdentical(first.NextKeyMarker, "b.txt");
    assertArrayLength(second.Versions ?? [], 1);
    assertFalse(second.IsTruncated);
    const last = (second.Versions ?? [])[0];
    assertNonNullable(last);
    assertIdentical(last.Key, "c.txt");
  });

  it("resumes after a key when only a key marker is given", async () => {
    // Given a versioned Bucket holding three keys
    const simAws = await bucketHolding(["a.txt", "b.txt", "c.txt"]);

    // When a listing resumes from a key without naming a version
    const listed = await simAws.s3().listObjectVersions(
      new ListObjectVersionsCommand({
        Bucket: "history",
        KeyMarker: "a.txt",
      }),
    );

    // Then it carries the keys after that one, exclusive of it.
    const versions = listed.Versions ?? [];
    assertArrayLength(versions, 2);
    const first = versions[0];
    assertNonNullable(first);
    assertIdentical(first.Key, "b.txt");
  });

  it("reports an empty page as complete rather than truncated", async () => {
    // Given a versioned Bucket holding three keys
    const simAws = await bucketHolding(["a.txt", "b.txt", "c.txt"]);

    // When a listing asks for no keys at all
    const listed = await simAws
      .s3()
      .listObjectVersions(
        new ListObjectVersionsCommand({ Bucket: "history", MaxKeys: 0 }),
      );

    // Then it is complete, because a page with nothing on it offers nowhere to
    // carry on from and a caller looping until completion would never stop.
    assertArrayLength(listed.Versions ?? [], 0);
    assertFalse(listed.IsTruncated);
    assertUndefined(listed.NextKeyMarker);
  });

  it("expires the current version behind a delete marker", async () => {
    // Given a versioned Bucket whose rule expires everything after thirty days
    const simAws = await bucketHolding(["raw/a.gz"]);
    const s3 = simAws.s3();
    await s3.putBucketLifecycleConfiguration(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: "history",
        LifecycleConfiguration: {
          Rules: [
            {
              ID: "expire",
              Status: "Enabled",
              Filter: { Prefix: "" },
              Expiration: { Days: 30 },
            },
          ],
        },
      }),
    );

    // When simulated time moves past the boundary
    await simAws.clock().advanceBy({ days: 400 });
    const objects = await s3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "history" }),
    );
    const listed = await s3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: "history" }),
    );

    // Then the expiry wrote a marker over the current version rather than
    // taking the version away, which is what real S3 does on a versioned
    // Bucket. Removing the version itself is a NoncurrentVersionExpiration.
    assertArrayLength(objects.Contents ?? [], 0);
    assertArrayLength(listed.DeleteMarkers ?? [], 1);
    const version = (listed.Versions ?? [])[0];
    assertNonNullable(version);
    assertFalse(version.IsLatest);
  });

  it("refuses a read of a delete marker by its own version id", async () => {
    // Given a versioned Bucket whose key has been deleted
    const simAws = await bucketHolding(["a.txt"]);
    const s3 = simAws.s3();
    const deleted = await s3.deleteObject(
      new DeleteObjectCommand({ Bucket: "history", Key: "a.txt" }),
    );
    assertNonNullable(deleted.VersionId);

    // When the marker itself is read
    const error = await assertThrowsErrorAsync(async () =>
      s3.getObject(
        new GetObjectCommand({
          Bucket: "history",
          Key: "a.txt",
          VersionId: deleted.VersionId,
        }),
      ),
    );

    // Then it is MethodNotAllowed, because the marker exists and holds no
    // bytes to send.
    assertIdentical(error.name, "MethodNotAllowed");
  });

  it("answers a delete of a version under a key that holds none", async () => {
    // Given a versioned Bucket holding one key
    const simAws = await bucketHolding(["a.txt"]);

    // When a version of a key nothing was ever written under is deleted
    const deleted = await simAws.s3().deleteObject(
      new DeleteObjectCommand({
        Bucket: "history",
        Key: "never-written.txt",
        VersionId: "made-up",
      }),
    );

    // Then it succeeds, because real S3 answers a version that was never there
    // the same way it answers one it removed.
    assertIdentical(deleted.VersionId, "made-up");
    assertUndefined(deleted.DeleteMarker);
  });

  it("writes one null delete marker while versioning is suspended", async () => {
    // Given a Bucket whose versioning has been suspended
    const simAws = await bucketHolding(["a.txt"]);
    const s3 = simAws.s3();
    await s3.putBucketVersioning(
      new PutBucketVersioningCommand({
        Bucket: "history",
        VersioningConfiguration: { Status: "Suspended" },
      }),
    );

    // When the key is deleted twice
    const first = await s3.deleteObject(
      new DeleteObjectCommand({ Bucket: "history", Key: "a.txt" }),
    );
    await s3.deleteObject(
      new DeleteObjectCommand({ Bucket: "history", Key: "a.txt" }),
    );
    const listed = await s3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: "history" }),
    );

    // Then both deletes share the one null marker, and the version written
    // while versioning was enabled is still underneath it.
    assertIdentical(first.VersionId, "null");
    assertArrayLength(listed.DeleteMarkers ?? [], 1);
    assertArrayLength(listed.Versions ?? [], 1);
  });
});

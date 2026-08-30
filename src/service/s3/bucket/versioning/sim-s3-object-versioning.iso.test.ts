import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
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
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";

/**
 * The body of a read, as the string it was written from.
 */
async function readBody(
  body: AsyncIterable<Buffer> | undefined,
): Promise<string> {
  assertNonNullable(body);
  const buffer = await simS3BodyToBuffer(body);

  return buffer.toString();
}

/**
 * A versioned Bucket, with the given key written once and then, where a second
 * body is given, written over.
 *
 * The writes are sequential rather than concurrent, because which of them ends
 * up current is the whole point of the versions they make.
 */
async function bucketWithVersions(
  key: string,
  first: string,
  second?: string,
): Promise<{ simAws: SimAws; versionIds: readonly string[] }> {
  const simAws = new SimAws();
  const s3 = simAws.s3();

  await s3.createBucket(new CreateBucketCommand({ Bucket: "snapshots" }));
  await s3.putBucketVersioning(
    new PutBucketVersioningCommand({
      Bucket: "snapshots",
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );

  const older = await s3.putObject(
    new PutObjectCommand({ Bucket: "snapshots", Key: key, Body: first }),
  );
  assertNonNullable(older.VersionId);

  if (second === undefined) {
    return { simAws, versionIds: [older.VersionId] };
  }

  const newer = await s3.putObject(
    new PutObjectCommand({ Bucket: "snapshots", Key: key, Body: second }),
  );
  assertNonNullable(newer.VersionId);

  return { simAws, versionIds: [older.VersionId, newer.VersionId] };
}

describe("Versioning a simulated S3 Bucket", () => {
  it("reports the versioning status a Bucket was configured with", async () => {
    // Given a Bucket nobody has configured
    const simAws = new SimAws();
    const s3 = simAws.s3();
    await s3.createBucket(new CreateBucketCommand({ Bucket: "snapshots" }));

    // When its versioning is read before and after being enabled
    const before = await s3.getBucketVersioning(
      new GetBucketVersioningCommand({ Bucket: "snapshots" }),
    );
    await s3.putBucketVersioning(
      new PutBucketVersioningCommand({
        Bucket: "snapshots",
        VersioningConfiguration: { Status: "Enabled" },
      }),
    );
    const after = await s3.getBucketVersioning(
      new GetBucketVersioningCommand({ Bucket: "snapshots" }),
    );

    // Then an unconfigured Bucket reports no status at all, which is what
    // separates it from one that has been suspended.
    assertUndefined(before.Status);
    assertIdentical(after.Status, "Enabled");
  });

  it("keeps the earlier version when a key is written over", async () => {
    // Given a versioned Bucket whose key has been written twice
    const { simAws, versionIds } = await bucketWithVersions(
      "reader-1.json",
      "before",
      "after",
    );

    // When the earlier version is read back by its own id
    const earlier = await simAws.s3().getObject(
      new GetObjectCommand({
        Bucket: "snapshots",
        Key: "reader-1.json",
        VersionId: versionIds[0],
      }),
    );
    const current = await simAws
      .s3()
      .getObject(
        new GetObjectCommand({ Bucket: "snapshots", Key: "reader-1.json" }),
      );

    // Then the write did not overwrite it, and a read naming no version still
    // answers with the newest.
    assertIdentical(await readBody(earlier.Body), "before");
    assertIdentical(await readBody(current.Body), "after");
  });

  it("lists every version of a key and marks one of them latest", async () => {
    // Given a versioned Bucket whose key has been written twice
    const { simAws, versionIds } = await bucketWithVersions(
      "reader-1.json",
      "before",
      "after",
    );

    // When the versions and the current Objects are both listed
    const versions = await simAws.s3().listObjectVersions(
      new ListObjectVersionsCommand({
        Bucket: "snapshots",
        Prefix: "reader-",
      }),
    );
    const objects = await simAws
      .s3()
      .listObjectsV2(new ListObjectsV2Command({ Bucket: "snapshots" }));

    // Then the version listing holds both and the Object listing holds the
    // current one alone.
    const listed = versions.Versions ?? [];
    assertArrayLength(listed, 2);
    const newer = listed[0];
    const older = listed[1];
    assertNonNullable(newer);
    assertNonNullable(older);
    assertIdentical(newer.VersionId, versionIds[1]);
    assertTrue(newer.IsLatest);
    assertIdentical(older.VersionId, versionIds[0]);
    assertFalse(older.IsLatest);
    assertArrayLength(objects.Contents ?? [], 1);
  });

  it("hides an Object behind a delete marker and brings it back", async () => {
    // Given a versioned Bucket holding one Object
    const { simAws } = await bucketWithVersions("reader-1.json", "before");
    const s3 = simAws.s3();

    // When the key is deleted and the marker is then deleted by its own id
    const deleted = await s3.deleteObject(
      new DeleteObjectCommand({ Bucket: "snapshots", Key: "reader-1.json" }),
    );
    assertNonNullable(deleted.VersionId);
    const hidden = await s3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "snapshots" }),
    );
    const reading = await assertThrowsErrorAsync(async () =>
      s3.getObject(
        new GetObjectCommand({ Bucket: "snapshots", Key: "reader-1.json" }),
      ),
    );
    await s3.deleteObject(
      new DeleteObjectCommand({
        Bucket: "snapshots",
        Key: "reader-1.json",
        VersionId: deleted.VersionId,
      }),
    );
    const restored = await s3.getObject(
      new GetObjectCommand({ Bucket: "snapshots", Key: "reader-1.json" }),
    );

    // Then the delete wrote a marker rather than removing anything, and
    // removing the marker exposed the Object underneath it again.
    assertTrue(deleted.DeleteMarker);
    assertArrayLength(hidden.Contents ?? [], 0);
    assertIdentical(reading.name, "NoSuchKey");
    assertIdentical(await readBody(restored.Body), "before");
  });

  it("removes one named version and leaves the others", async () => {
    // Given a versioned Bucket whose key has been written twice
    const { simAws, versionIds } = await bucketWithVersions(
      "reader-1.json",
      "before",
      "after",
    );

    // When the current version is deleted by its own id
    await simAws.s3().deleteObject(
      new DeleteObjectCommand({
        Bucket: "snapshots",
        Key: "reader-1.json",
        VersionId: versionIds[1],
      }),
    );
    const current = await simAws
      .s3()
      .getObject(
        new GetObjectCommand({ Bucket: "snapshots", Key: "reader-1.json" }),
      );

    // Then the version written before it becomes current again.
    assertIdentical(await readBody(current.Body), "before");
  });

  it("refuses a read of a version the Bucket never issued", async () => {
    // Given a versioned Bucket holding one Object
    const { simAws } = await bucketWithVersions("reader-1.json", "before");

    // When a read names a version id nothing was written under
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().getObject(
        new GetObjectCommand({
          Bucket: "snapshots",
          Key: "reader-1.json",
          VersionId: "never-issued",
        }),
      ),
    );

    // Then it is NoSuchVersion rather than NoSuchKey, because the key is there.
    assertIdentical(error.name, "NoSuchVersion");
  });
});

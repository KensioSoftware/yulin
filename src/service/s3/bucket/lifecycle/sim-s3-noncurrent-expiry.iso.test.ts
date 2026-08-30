import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { LifecycleRule } from "@aws-sdk/client-s3";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";
import type { SimS3 } from "../../sim-s3.js";

const bucketName = "reader-history";
const key = "snapshots/reader-1.json";

/** A versioned Bucket carrying the given rules. */
async function versionedBucket(
  simAws: SimAws,
  rules: readonly LifecycleRule[],
): Promise<SimS3> {
  const s3 = simAws.s3();

  await s3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await s3.putBucketVersioning(
    new PutBucketVersioningCommand({
      Bucket: bucketName,
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );
  await s3.putBucketLifecycleConfiguration(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucketName,
      LifecycleConfiguration: { Rules: [...rules] },
    }),
  );

  return s3;
}

/** A rule expiring noncurrent versions of the snapshot prefix. */
function expiresNoncurrentAfter(
  days: number,
  newer?: number,
): readonly LifecycleRule[] {
  return [
    {
      ID: "expire-noncurrent",
      Status: "Enabled",
      Filter: { Prefix: "snapshots/" },
      NoncurrentVersionExpiration: {
        NoncurrentDays: days,
        ...(newer !== undefined && { NewerNoncurrentVersions: newer }),
      },
    },
  ];
}

/** Write one snapshot, answering the version it was given. */
async function putSnapshot(s3: SimS3, body: string): Promise<string> {
  const put = await s3.putObject(
    new PutObjectCommand({ Bucket: bucketName, Key: key, Body: body }),
  );

  assertNonNullable(put.VersionId);

  return put.VersionId;
}

/** The version ids a listing reports, newest first. */
async function listedVersions(s3: SimS3): Promise<readonly string[]> {
  const listed = await s3.listObjectVersions(
    new ListObjectVersionsCommand({ Bucket: bucketName }),
  );

  return (listed.Versions ?? []).map((version) => version.VersionId);
}

describe("S3 NoncurrentVersionExpiration", () => {
  it("expires a version older than NoncurrentDays and keeps the current one", async () => {
    // Given a Bucket bounding its history at ninety days, holding two
    // snapshots of one reader.
    const simAws = new SimAws();
    const s3 = await versionedBucket(simAws, expiresNoncurrentAfter(90));
    const first = await putSnapshot(s3, "before");
    const second = await putSnapshot(s3, "after");

    // When simulated time passes the ninety days.
    await simAws.clock().advanceBy({ days: 91 });

    // Then the displaced version is gone from the listing and the current one
    // stays, however old it is. The current version has no displacement to
    // count from, which is what keeps every rule for noncurrent ones off it.
    assertArrayEquals(await listedVersions(s3), [second]);
    assertUndefined(
      simAws.s3().getSimBucketByName(bucketName)?.getVersions().current(key)
        ?.noncurrentSince,
    );

    // And reading it by its own id finds nothing.
    const error = await assertThrowsErrorAsync(async () => {
      return await s3.getObject(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: first,
        }),
      );
    });

    assertIdentical(error.name, "NoSuchVersion");

    // And the current version still reads.
    const current = await s3.getObject(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertNonNullable(current.Body);

    const body = await simS3BodyToBuffer(current.Body);
    assertIdentical(body.toString(), "after");
  });

  it("counts the period from the displacement rather than the write", async () => {
    // Given a snapshot written and left as the current version for a year.
    const simAws = new SimAws();
    const s3 = await versionedBucket(simAws, expiresNoncurrentAfter(90));
    const first = await putSnapshot(s3, "before");

    await simAws.clock().advanceBy({ days: 365 });

    // When a second write displaces it and a day passes.
    const second = await putSnapshot(s3, "after");
    await simAws.clock().advanceBy({ days: 1 });

    // Then it is still there, having been noncurrent for a day rather than a
    // year.
    assertArrayEquals(await listedVersions(s3), [second, first]);

    // And ninety days after the displacement it goes.
    await simAws.clock().advanceBy({ days: 90 });

    assertArrayEquals(await listedVersions(s3), [second]);
  });

  it("keeps the number of noncurrent versions NewerNoncurrentVersions names", async () => {
    // Given a rule keeping the two most recent noncurrent versions.
    const simAws = new SimAws();
    const s3 = await versionedBucket(simAws, expiresNoncurrentAfter(30, 2));

    await putSnapshot(s3, "one");
    const second = await putSnapshot(s3, "two");
    const third = await putSnapshot(s3, "three");
    const current = await putSnapshot(s3, "four");

    // When every one of them is older than thirty days.
    await simAws.clock().advanceBy({ days: 31 });

    // Then the current version and the two newest noncurrent ones stay, and
    // the oldest goes.
    assertArrayEquals(await listedVersions(s3), [current, third, second]);
  });

  it("leaves versions alone under a Disabled rule", async () => {
    // Given the same rule turned off.
    const simAws = new SimAws();
    const s3 = await versionedBucket(simAws, [
      {
        ID: "expire-noncurrent",
        Status: "Disabled",
        Filter: { Prefix: "snapshots/" },
        NoncurrentVersionExpiration: { NoncurrentDays: 90 },
      },
    ]);
    await putSnapshot(s3, "before");
    await putSnapshot(s3, "after");

    // When a year passes, then both versions are still there.
    await simAws.clock().advanceBy({ days: 365 });

    assertArrayLength(await listedVersions(s3), 2);
  });

  it("reaches only the keys its prefix names", async () => {
    // Given a rule scoped to the snapshot prefix.
    const simAws = new SimAws();
    const s3 = await versionedBucket(simAws, expiresNoncurrentAfter(90));

    await putSnapshot(s3, "before");
    await putSnapshot(s3, "after");

    const other = { Bucket: bucketName, Key: "exports/reader-1.csv" };
    await s3.putObject(new PutObjectCommand({ ...other, Body: "before" }));
    await s3.putObject(new PutObjectCommand({ ...other, Body: "after" }));

    // When a year passes.
    await simAws.clock().advanceBy({ days: 365 });

    // Then the snapshot lost its noncurrent version and the export kept both.
    const listed = await s3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: bucketName }),
    );
    const byKey = (listed.Versions ?? []).filter(
      (version) => version.Key === "exports/reader-1.csv",
    );

    assertArrayLength(listed.Versions ?? [], 3);
    assertArrayLength(byKey, 2);
  });

  it("expires nothing under a rule naming no period to wait out", async () => {
    // Given a rule keeping two noncurrent versions and stating no
    // NoncurrentDays, which real S3 requires alongside that count.
    const simAws = new SimAws();
    const s3 = await versionedBucket(simAws, [
      {
        ID: "expire-noncurrent",
        Status: "Enabled",
        Filter: { Prefix: "snapshots/" },
        NoncurrentVersionExpiration: { NewerNoncurrentVersions: 2 },
      },
    ]);

    await putSnapshot(s3, "one");
    await putSnapshot(s3, "two");
    await putSnapshot(s3, "three");
    await putSnapshot(s3, "four");

    // When a year passes, then every version is still there. A count with no
    // period behind it names nothing to measure.
    await simAws.clock().advanceBy({ days: 365 });

    assertArrayLength(await listedVersions(s3), 4);
  });

  it("expires a delete marker that has become noncurrent", async () => {
    // Given a key written, deleted, and written again, which leaves the
    // marker as a noncurrent version between the two writes.
    const simAws = new SimAws();
    const s3 = await versionedBucket(simAws, expiresNoncurrentAfter(90));

    await putSnapshot(s3, "before");
    await s3.deleteObject(
      new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
    );
    const current = await putSnapshot(s3, "after");

    // When the ninety days pass.
    await simAws.clock().advanceBy({ days: 91 });

    // Then the marker goes with the version under it, since a noncurrent
    // marker is a noncurrent version like any other.
    const listed = await s3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: bucketName }),
    );

    assertArrayLength(listed.DeleteMarkers ?? [], 0);
    assertArrayEquals(await listedVersions(s3), [current]);
  });

  it("removes a delete marker left with nothing under it", async () => {
    // Given a rule expiring noncurrent versions and the delete markers left
    // bare by them.
    const simAws = new SimAws();
    const s3 = await versionedBucket(simAws, [
      {
        ID: "expire-noncurrent",
        Status: "Enabled",
        Filter: { Prefix: "snapshots/" },
        NoncurrentVersionExpiration: { NoncurrentDays: 90 },
        Expiration: { ExpiredObjectDeleteMarker: true },
      },
    ]);

    await putSnapshot(s3, "before");
    await s3.deleteObject(
      new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
    );

    // When the version under the marker expires.
    await simAws.clock().advanceBy({ days: 91 });

    // Then the marker goes with it and the key leaves the listing entirely.
    const listed = await s3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: bucketName }),
    );

    assertArrayLength(listed.Versions ?? [], 0);
    assertArrayLength(listed.DeleteMarkers ?? [], 0);
  });

  it("keeps a delete marker with a version still under it", async () => {
    // Given the same rule, and a key whose noncurrent version is too young to
    // expire.
    const simAws = new SimAws();
    const s3 = await versionedBucket(simAws, [
      {
        ID: "expire-noncurrent",
        Status: "Enabled",
        Filter: { Prefix: "snapshots/" },
        NoncurrentVersionExpiration: { NoncurrentDays: 90 },
        Expiration: { ExpiredObjectDeleteMarker: true },
      },
    ]);

    await putSnapshot(s3, "before");
    await s3.deleteObject(
      new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
    );

    // When a day passes, then the marker stays, because the version beneath it
    // is still there and the marker is what hides it.
    await simAws.clock().advanceBy({ days: 1 });

    const listed = await s3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: bucketName }),
    );

    assertArrayLength(listed.Versions ?? [], 1);
    assertArrayLength(listed.DeleteMarkers ?? [], 1);
  });
});

import {
  CreateBucketCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

describe("Configuring versioning on a simulated S3 Bucket", () => {
  it("gives an Object written before versioning the null version id", async () => {
    // Given a Bucket holding an Object, versioned afterwards
    const simAws = new SimAws();
    const s3 = simAws.s3();
    await s3.createBucket(new CreateBucketCommand({ Bucket: "snapshots" }));
    const unversioned = await s3.putObject(
      new PutObjectCommand({
        Bucket: "snapshots",
        Key: "reader-1.json",
        Body: "before versioning",
      }),
    );

    // When versioning is enabled and the versions are listed
    await s3.putBucketVersioning(
      new PutBucketVersioningCommand({
        Bucket: "snapshots",
        VersioningConfiguration: { Status: "Enabled" },
      }),
    );
    const listed = await s3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: "snapshots" }),
    );

    // Then the write that predates the configuration reports no version id of
    // its own, and reads back under the null one real S3 gives it.
    assertUndefined(unversioned.VersionId);
    const versions = listed.Versions ?? [];
    assertArrayLength(versions, 1);
    const only = versions[0];
    assertNonNullable(only);
    assertIdentical(only.VersionId, "null");
    assertTrue(only.IsLatest);
  });

  it("writes over the null version while versioning is suspended", async () => {
    // Given a versioned Bucket holding one version of a key
    const simAws = new SimAws();
    const s3 = simAws.s3();
    await s3.createBucket(new CreateBucketCommand({ Bucket: "snapshots" }));
    await s3.putBucketVersioning(
      new PutBucketVersioningCommand({
        Bucket: "snapshots",
        VersioningConfiguration: { Status: "Enabled" },
      }),
    );
    const kept = await s3.putObject(
      new PutObjectCommand({
        Bucket: "snapshots",
        Key: "reader-1.json",
        Body: "kept",
      }),
    );
    assertNonNullable(kept.VersionId);

    // When versioning is suspended and the key is written twice more
    await s3.putBucketVersioning(
      new PutBucketVersioningCommand({
        Bucket: "snapshots",
        VersioningConfiguration: { Status: "Suspended" },
      }),
    );
    await s3.putObject(
      new PutObjectCommand({
        Bucket: "snapshots",
        Key: "reader-1.json",
        Body: "first while suspended",
      }),
    );
    await s3.putObject(
      new PutObjectCommand({
        Bucket: "snapshots",
        Key: "reader-1.json",
        Body: "second while suspended",
      }),
    );
    const listed = await s3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: "snapshots" }),
    );
    const status = await s3.getBucketVersioning(
      new GetBucketVersioningCommand({ Bucket: "snapshots" }),
    );

    // Then the suspended writes share the one null version between them, and
    // the version written while versioning was on is still there.
    assertIdentical(status.Status, "Suspended");
    const versions = listed.Versions ?? [];
    assertArrayLength(versions, 2);
    const newer = versions[0];
    const older = versions[1];
    assertNonNullable(newer);
    assertNonNullable(older);
    assertIdentical(newer.VersionId, "null");
    assertIdentical(older.VersionId, kept.VersionId);
  });

  it("lists a Bucket that keeps no versions as one version deep", async () => {
    // Given a Bucket nobody has versioned, holding two Objects
    const simAws = new SimAws();
    const s3 = simAws.s3();
    await s3.createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await s3.putObject(
      new PutObjectCommand({ Bucket: "uploads", Key: "b.txt", Body: "b" }),
    );
    await s3.putObject(
      new PutObjectCommand({ Bucket: "uploads", Key: "a.txt", Body: "a" }),
    );

    // When its versions are listed
    const listed = await s3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: "uploads" }),
    );

    // Then each Object comes back once under the null version id, in key
    // order, and marked latest.
    const versions = listed.Versions ?? [];
    assertArrayLength(versions, 2);
    const first = versions[0];
    const second = versions[1];
    assertNonNullable(first);
    assertNonNullable(second);
    assertIdentical(first.Key, "a.txt");
    assertIdentical(first.VersionId, "null");
    assertTrue(first.IsLatest);
    assertIdentical(second.Key, "b.txt");
  });

  it("reads the null version of a Bucket that keeps no versions", async () => {
    // Given a Bucket nobody has versioned, holding one Object
    const simAws = new SimAws();
    const s3 = simAws.s3();
    await s3.createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await s3.putObject(
      new PutObjectCommand({ Bucket: "uploads", Key: "a.txt", Body: "a" }),
    );

    // When a read names a version id other than the null one
    const error = await assertThrowsErrorAsync(async () =>
      s3.getObject(
        new GetObjectCommand({
          Bucket: "uploads",
          Key: "a.txt",
          VersionId: "made-up",
        }),
      ),
    );

    // Then it is refused, because that Bucket has issued no version but null.
    assertIdentical(error.name, "NoSuchVersion");
  });

  it("refuses a versioning status S3 does not take", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    const s3 = simAws.s3();
    await s3.createBucket(new CreateBucketCommand({ Bucket: "snapshots" }));

    // When it is asked for a status that is neither Enabled nor Suspended
    const error = await assertThrowsErrorAsync(async () =>
      s3.putBucketVersioning(
        new PutBucketVersioningCommand({
          Bucket: "snapshots",
          VersioningConfiguration: { Status: "Disabled" as "Enabled" },
        }),
      ),
    );

    // Then it is refused rather than stored, because there is no request that
    // takes a Bucket back to unversioned.
    assertIdentical(error.name, "InvalidArgument");
    assertStringIncludes(error.message, "Enabled or Suspended");
  });

  it("refuses MFA delete rather than reporting it enabled", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    const s3 = simAws.s3();
    await s3.createBucket(new CreateBucketCommand({ Bucket: "snapshots" }));

    // When versioning is asked for with MFA delete on
    const error = await assertThrowsErrorAsync(async () =>
      s3.putBucketVersioning(
        new PutBucketVersioningCommand({
          Bucket: "snapshots",
          VersioningConfiguration: {
            Status: "Enabled",
            MFADelete: "Enabled",
          },
        }),
      ),
    );

    // Then it is refused, because a Bucket reporting a protection it does not
    // enforce is the wrong answer to what the test is asking.
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "MFA delete");
  });
});

import { describe, it } from "vitest";
import {
  CreateBucketCommand,
  ListObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { SimS3 } from "../../sim-s3.js";

describe("S3 ListObjectsCommand", () => {
  it("lists all Objects in an S3 Bucket", async () => {
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    await Promise.all([
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "foo.txt",
          Body: "foo",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "bar.txt",
          Body: "bar",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "baz.txt",
          Body: "baz",
        }),
      ),
    ]);

    const listObjectsOutput = await simS3.listObjects(
      new ListObjectsCommand({ Bucket: "bucket-a" }),
    );

    assertArrayLength(listObjectsOutput.Contents, 3);

    assertIdentical(listObjectsOutput.Contents[0].Key, "bar.txt");
    assertIdentical(listObjectsOutput.Contents[0].Size, 3);
    assertIdentical(listObjectsOutput.Contents[1].Key, "baz.txt");
    assertIdentical(listObjectsOutput.Contents[1].Size, 3);
    assertIdentical(listObjectsOutput.Contents[2].Key, "foo.txt");
    assertIdentical(listObjectsOutput.Contents[2].Size, 3);

    assertIdentical(listObjectsOutput.Name, "bucket-a");
    assertFalse(listObjectsOutput.IsTruncated);
    assertUndefined(listObjectsOutput.NextMarker);
  });

  it("lists Objects with prefix", async () => {
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    await Promise.all([
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "foo/a.txt",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "foo/b.txt",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "bar/a.txt",
        }),
      ),
    ]);

    const listObjectsOutput = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "bucket-a",
        Prefix: "foo/",
      }),
    );

    assertArrayLength(listObjectsOutput.Contents, 2);

    assertIdentical(listObjectsOutput.Contents[0].Key, "foo/a.txt");
    assertIdentical(listObjectsOutput.Contents[1].Key, "foo/b.txt");
    assertIdentical(listObjectsOutput.Prefix, "foo/");
  });

  it("lists Objects with max keys", async () => {
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    await Promise.all([
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "a.txt",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "b.txt",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "c.txt",
        }),
      ),
    ]);

    const listObjectsOutput = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "bucket-a",
        MaxKeys: 2,
      }),
    );

    assertArrayLength(listObjectsOutput.Contents, 2);

    assertIdentical(listObjectsOutput.Contents[0].Key, "a.txt");
    assertIdentical(listObjectsOutput.Contents[1].Key, "b.txt");
    assertIdentical(listObjectsOutput.MaxKeys, 2);
    assertTrue(listObjectsOutput.IsTruncated);
    assertIdentical(listObjectsOutput.NextMarker, "b.txt");
  });

  it("lists Objects with marker", async () => {
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    await Promise.all([
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "a.txt",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "b.txt",
        }),
      ),
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "c.txt",
        }),
      ),
    ]);

    const listObjectsOutput = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "bucket-a",
        Marker: "b.txt",
      }),
    );

    assertArrayLength(listObjectsOutput.Contents, 1);

    assertIdentical(listObjectsOutput.Contents[0].Key, "c.txt");
    assertIdentical(listObjectsOutput.Marker, "b.txt");
    assertFalse(listObjectsOutput.IsTruncated);
    assertUndefined(listObjectsOutput.NextMarker);
  });

  it("returns no Contents at all for a Bucket with nothing in it", async () => {
    // Given an empty Bucket.
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-e" }));

    // When it is listed.
    const listObjectsOutput = await simS3.listObjects(
      new ListObjectsCommand({ Bucket: "bucket-e" }),
    );

    // Then Contents is absent rather than empty, as it is in real S3, so a
    // caller that assumes an array here fails the same way against both.
    assertUndefined(listObjectsOutput.Contents);
    assertFalse(listObjectsOutput.IsTruncated);
  });

  it("rejects undefined bucket name", async () => {
    const simS3 = new SimS3();

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.listObjects(
        new ListObjectsCommand({
          Bucket: undefined,
        }),
      );
    });

    assertStringIncludes(error.message, "ListObjectsCommand.input.Bucket");
  });

  it("rejects non-existent bucket", async () => {
    const simS3 = new SimS3();

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.listObjects(
        new ListObjectsCommand({
          Bucket: "bucket-a",
        }),
      );
    });

    assertStringIncludes(error.message, "No S3 Bucket named bucket-a");
  });
});

describe("S3 ListObjectsCommand with a Delimiter", () => {
  async function bucketOfFolders(...keys: readonly string[]): Promise<SimS3> {
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "widgets" }));
    await Promise.all(
      keys.map(async (key) =>
        simS3.putObject(
          new PutObjectCommand({ Bucket: "widgets", Key: key, Body: key }),
        ),
      ),
    );

    return simS3;
  }

  it("rolls keys up into CommonPrefixes, as the second version does", async () => {
    // Given a Bucket holding keys at two levels.
    const simS3 = await bucketOfFolders("img/a.png", "img/b.png", "index.html");

    // When the top of the tree is listed.
    const output = await simS3.listObjects(
      new ListObjectsCommand({ Bucket: "widgets", Delimiter: "/" }),
    );

    // Then the folder comes back once, its keys are left out of Contents, and
    // the Delimiter is echoed back.
    assertArrayLength(output.CommonPrefixes, 1);
    assertIdentical(output.CommonPrefixes[0].Prefix, "img/");
    assertArrayLength(output.Contents, 1);
    assertIdentical(output.Contents[0].Key, "index.html");
    assertIdentical(output.Delimiter, "/");
  });

  it("marks the next page with the folder a truncated page ended on", async () => {
    // Given a page with room for the first folder alone.
    const simS3 = await bucketOfFolders("img/a.png", "img/b.png", "index.html");

    // When the first page is taken.
    const first = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "widgets",
        Delimiter: "/",
        MaxKeys: 1,
      }),
    );

    // Then the marker names the folder rather than a key inside it, which a
    // caller has no way to work out from Contents.
    assertTrue(first.IsTruncated);
    assertIdentical(first.NextMarker, "img/");

    // When the listing carries on from that marker.
    const second = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "widgets",
        Delimiter: "/",
        Marker: first.NextMarker,
      }),
    );

    // Then the whole folder is behind the listing rather than rolled up again.
    assertUndefined(second.CommonPrefixes);
    assertArrayLength(second.Contents, 1);
    assertIdentical(second.Contents[0].Key, "index.html");
    assertFalse(second.IsTruncated);
  });
});

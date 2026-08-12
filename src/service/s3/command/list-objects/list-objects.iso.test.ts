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

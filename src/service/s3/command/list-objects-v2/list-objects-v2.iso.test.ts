import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3 } from "../../sim-s3.js";

describe("S3 ListObjectsV2Command", () => {
  it("lists all Objects in an S3 Bucket", async () => {
    // Given a Bucket holding a few Objects.
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

    // When the Bucket is listed.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "bucket-a" }),
    );

    // Then every key comes back in order, counted.
    assertArrayLength(output.Contents, 3);
    assertIdentical(output.Contents[0].Key, "bar.txt");
    assertIdentical(output.Contents[1].Key, "baz.txt");
    assertIdentical(output.Contents[2].Key, "foo.txt");

    assertIdentical(output.KeyCount, 3);
    assertIdentical(output.Name, "bucket-a");
    assertIdentical(output.MaxKeys, 1000);
    assertFalse(output.IsTruncated);
    assertUndefined(output.NextContinuationToken);
    assertUndefined(output.ContinuationToken);
    assertUndefined(output.StartAfter);
  });

  it("describes each Object the way a listing does", async () => {
    // Given a Bucket holding one Object of known content.
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-d" }));
    await simS3.putObject(
      new PutObjectCommand({ Bucket: "bucket-d", Key: "foo.txt", Body: "foo" }),
    );

    // When the Bucket is listed.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "bucket-d" }),
    );

    // Then the entry carries everything a caller needs to decide whether its
    // own copy matches, without reading the Object back.
    assertArrayLength(output.Contents, 1);
    const object = output.Contents[0];
    assertIdentical(object.Key, "foo.txt");
    assertIdentical(object.Size, 3);
    assertIdentical(object.ETag, '"acbd18db4cc2f85cedef654fccc4a4d8"');
    assertIdentical(object.StorageClass, "STANDARD");
    assertInstanceOf(object.LastModified, Date);
  });

  it("counts nothing for a Bucket with nothing in it", async () => {
    // Given an empty Bucket.
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-e" }));

    // When it is listed.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "bucket-e" }),
    );

    // Then the count says so, and there is no Contents at all, as in real S3.
    // That is what KeyCount is for, and what makes a caller reach for
    // `Contents ?? []` rather than assuming an array is there.
    assertIdentical(output.KeyCount, 0);
    assertUndefined(output.Contents);
    assertFalse(output.IsTruncated);
  });

  it("lists Objects under a prefix", async () => {
    // Given a Bucket holding Objects under two prefixes.
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-b" }));
    await Promise.all([
      simS3.putObject(
        new PutObjectCommand({ Bucket: "bucket-b", Key: "foo/a.txt" }),
      ),
      simS3.putObject(
        new PutObjectCommand({ Bucket: "bucket-b", Key: "foo/b.txt" }),
      ),
      simS3.putObject(
        new PutObjectCommand({ Bucket: "bucket-b", Key: "bar/a.txt" }),
      ),
    ]);

    // When one prefix is listed.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "bucket-b", Prefix: "foo/" }),
    );

    // Then only that prefix comes back, and the response says which it was.
    assertArrayLength(output.Contents, 2);
    assertIdentical(output.Contents[0].Key, "foo/a.txt");
    assertIdentical(output.Contents[1].Key, "foo/b.txt");
    assertIdentical(output.Prefix, "foo/");
    assertIdentical(output.KeyCount, 2);
  });

  it("starts after a key the caller names", async () => {
    // Given a Bucket holding Objects either side of a key.
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-c" }));
    await Promise.all([
      simS3.putObject(
        new PutObjectCommand({ Bucket: "bucket-c", Key: "a.txt" }),
      ),
      simS3.putObject(
        new PutObjectCommand({ Bucket: "bucket-c", Key: "b.txt" }),
      ),
      simS3.putObject(
        new PutObjectCommand({ Bucket: "bucket-c", Key: "c.txt" }),
      ),
    ]);

    // When the listing starts after one of them.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "bucket-c", StartAfter: "b.txt" }),
    );

    // Then that key and everything before it are left out, and the response
    // reports where the caller asked to start.
    assertArrayLength(output.Contents, 1);
    assertIdentical(output.Contents[0].Key, "c.txt");
    assertIdentical(output.StartAfter, "b.txt");
    assertIdentical(output.KeyCount, 1);
  });

  it("rejects undefined bucket name", async () => {
    const simS3 = new SimS3();

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.listObjectsV2(
        new ListObjectsV2Command({ Bucket: undefined }),
      );
    });

    assertStringIncludes(error.message, "ListObjectsV2Command.input.Bucket");
  });

  it("rejects non-existent bucket", async () => {
    const simS3 = new SimS3();

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.listObjectsV2(
        new ListObjectsV2Command({ Bucket: "bucket-a" }),
      );
    });

    assertStringIncludes(error.message, "No S3 Bucket named bucket-a");
  });
});

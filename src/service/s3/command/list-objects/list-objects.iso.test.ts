import { describe, it } from "vitest";
import { SimAwsAccount } from "../../../organizations/sim-aws-account.js";
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
  assertUndefined,
} from "@kensio/smartass";

describe("S3 ListObjectsCommand", () => {
  it("lists all Objects in an S3 Bucket", async () => {
    const simAccount = new SimAwsAccount();
    const simS3 = simAccount.getS3();

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
    const simAccount = new SimAwsAccount();
    const simS3 = simAccount.getS3();

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
    const simAccount = new SimAwsAccount();
    const simS3 = simAccount.getS3();

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
    assertIdentical(listObjectsOutput.IsTruncated, true);
    assertIdentical(listObjectsOutput.NextMarker, "b.txt");
  });

  it("lists Objects with marker", async () => {
    const simAccount = new SimAwsAccount();
    const simS3 = simAccount.getS3();

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

  it("rejects undefined bucket name", async () => {
    const simAccount = new SimAwsAccount();
    const simS3 = simAccount.getS3();

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
    const simAccount = new SimAwsAccount();
    const simS3 = simAccount.getS3();

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

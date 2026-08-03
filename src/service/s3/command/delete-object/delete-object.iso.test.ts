import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeObject,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3NoSuchKey } from "../../error/sim-s3.error.js";

describe("S3 DeleteObjectCommand", () => {
  it("removes an Object so a following GetObject cannot find it", async () => {
    // Given an Object in a Bucket
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "receipt.pdf",
        Body: "a receipt",
      }),
    );

    // When it is deleted
    await simS3.deleteObject(
      new DeleteObjectCommand({ Bucket: "uploads", Key: "receipt.pdf" }),
    );

    // Then reading it back raises the missing-key error real S3 answers with
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({ Bucket: "uploads", Key: "receipt.pdf" }),
      ),
    );
    assertInstanceOf(error, SimS3NoSuchKey);
  });

  it("leaves the other Objects in the Bucket alone", async () => {
    // Given two Objects in a Bucket
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simS3.putObject(
      new PutObjectCommand({ Bucket: "uploads", Key: "a.txt", Body: "a" }),
    );
    await simS3.putObject(
      new PutObjectCommand({ Bucket: "uploads", Key: "b.txt", Body: "b" }),
    );

    // When one of them is deleted
    await simS3.deleteObject(
      new DeleteObjectCommand({ Bucket: "uploads", Key: "a.txt" }),
    );

    // Then the other is still listed
    const listing = await simS3.listObjects(
      new ListObjectsCommand({ Bucket: "uploads" }),
    );
    assertArrayLength(listing.Contents ?? [], 1);
    assertIdentical(listing.Contents?.[0]?.Key, "b.txt");
  });

  it("succeeds for a key that is not there", async () => {
    // Given a Bucket with nothing in it
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a key that was never stored is deleted
    const output = await simS3.deleteObject(
      new DeleteObjectCommand({ Bucket: "uploads", Key: "never-here.pdf" }),
    );

    // Then it succeeds, as real S3 does: deletion is idempotent
    assertTypeObject(output.$metadata);
  });

  it("reports a Bucket that does not exist", async () => {
    // Given no Bucket of that name
    const simS3 = new SimAws().s3();

    // When an Object is deleted from it
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteObject(
        new DeleteObjectCommand({ Bucket: "absent", Key: "receipt.pdf" }),
      ),
    );

    // Then the missing Bucket is reported before anything else
    assertStringIncludes(error.message, "No S3 Bucket named absent");
  });

  it("rejects a request naming no Bucket", async () => {
    // Given a command with no Bucket
    const simS3 = new SimAws().s3();

    // When it is handled
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteObject(
        new DeleteObjectCommand({ Bucket: undefined, Key: "receipt.pdf" }),
      ),
    );

    // Then the malformed request is reported
    assertStringIncludes(error.message, "DeleteObjectCommand.input.Bucket");
  });

  it("rejects a request naming no key", async () => {
    // Given a command with no Key
    const simS3 = new SimAws().s3();

    // When it is handled
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteObject(
        new DeleteObjectCommand({ Bucket: "uploads", Key: undefined }),
      ),
    );

    // Then the malformed request is reported
    assertStringIncludes(error.message, "DeleteObjectCommand.input.Key");
  });
});

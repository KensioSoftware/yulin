import {
  CopyObjectCommand,
  CreateBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

describe("S3 CopyObjectCommand refusals", () => {
  it("reports a missing source Object as NoSuchKey", async () => {
    // Given a Bucket that has never held the key the copy names.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const bucketName = `documents-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    // When a copy names it as its source.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.copyObject(
        new CopyObjectCommand({
          Bucket: bucketName,
          Key: "there.txt",
          CopySource: `${bucketName}/missing.txt`,
        }),
      ),
    );

    // Then S3's missing-Object error is what comes back.
    assertIdentical(error.name, "NoSuchKey");
  });

  it("reports a missing source Bucket as NoSuchBucket", async () => {
    // Given a destination Bucket and a source Bucket that was never created.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const bucketName = `documents-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    // When a copy reads from the Bucket that is not there.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.copyObject(
        new CopyObjectCommand({
          Bucket: bucketName,
          Key: "there.txt",
          CopySource: "no-such-bucket/anything.txt",
        }),
      ),
    );

    // Then it is the Bucket that is reported missing, not the key.
    assertIdentical(error.name, "NoSuchBucket");
  });

  it("refuses a copy of an Object onto itself that changes nothing", async () => {
    // Given an Object a caller is about to copy over itself.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const bucketName = `documents-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "same.txt",
        Body: "unchanged",
      }),
    );

    // When the copy names the same Bucket and key, with no metadata directive.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.copyObject(
        new CopyObjectCommand({
          Bucket: bucketName,
          Key: "same.txt",
          CopySource: `${bucketName}/same.txt`,
        }),
      ),
    );

    // Then real S3's refusal is what comes back, because the copy would leave
    // the Object exactly as it found it.
    assertIdentical(error.name, "InvalidRequest");
    assertStringIncludes(error.message, "copy an object to itself");
  });

  it("refuses a source naming a versionId", async () => {
    // Given a Bucket holding the Object a versioned copy would read.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const bucketName = `documents-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "versioned.txt",
        Body: "one version",
      }),
    );

    // When the copy asks for a particular version of it.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.copyObject(
        new CopyObjectCommand({
          Bucket: bucketName,
          Key: "copy.txt",
          CopySource: `${bucketName}/versioned.txt?versionId=abc123`,
        }),
      ),
    );

    // Then it is refused by name rather than copying the only version there is.
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "versionId");
  });

  it("refuses a source that names no Object key", async () => {
    // Given a Bucket a malformed copy names as its whole source.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const bucketName = `documents-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    // When the copy's source is a Bucket on its own.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.copyObject(
        new CopyObjectCommand({
          Bucket: bucketName,
          Key: "copy.txt",
          CopySource: bucketName,
        }),
      ),
    );

    // Then the argument is reported rather than read as a key.
    assertIdentical(error.name, "InvalidArgument");
  });

  it("refuses a source that is not URL-encoded", async () => {
    // Given a Bucket a copy names a badly encoded key in.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const bucketName = `documents-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    // When the source carries a percent sign that starts no escape.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.copyObject(
        new CopyObjectCommand({
          Bucket: bucketName,
          Key: "copy.txt",
          CopySource: `${bucketName}/100%discount.txt`,
        }),
      ),
    );

    // Then the source is reported as unreadable rather than guessed at.
    assertIdentical(error.name, "InvalidArgument");
    assertStringIncludes(error.message, "URL-encoded");
  });
});

import {
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectTaggingCommand,
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  reportBucket,
  tagsByKey,
} from "../../../../test/s3/object-tagging-fixture.js";

/**
 * Tagging simulated S3 Objects.
 *
 * A tag set arrives either as a query string on the write that stores the
 * Object or as a document of its own, and both end up in the same place. These
 * drive the SDK Commands, which is what application code reaches for.
 */
describe("Simulated S3 Object tagging", () => {
  it("round-trips a tag set through the tagging commands", async () => {
    // Given a stored Object nobody has tagged.
    const { simS3, bucketName, key } = await reportBucket();

    // When a tag set is put on it.
    await simS3.putObjectTagging(
      new PutObjectTaggingCommand({
        Bucket: bucketName,
        Key: key,
        Tagging: {
          TagSet: [
            { Key: "department", Value: "finance" },
            { Key: "retention", Value: "long" },
          ],
        },
      }),
    );

    // Then a read reports it.
    const read = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({ Bucket: bucketName, Key: key }),
    );

    assertIdentical(tagsByKey(read.TagSet)["department"], "finance");
    assertIdentical(tagsByKey(read.TagSet)["retention"], "long");
  });

  it("reports no tags for an Object nobody has tagged", async () => {
    // Given a stored Object no tagging request has ever named.
    const { simS3, bucketName, key } = await reportBucket();

    // When its tags are read.
    const read = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({ Bucket: bucketName, Key: key }),
    );

    // Then the set is empty rather than the read being refused.
    assertArrayEmpty(read.TagSet);
  });

  it("stores the tags a write named", async () => {
    // Given an Object written with a `Tagging` query string.
    const { simS3, bucketName, key } = await reportBucket(
      "department=finance&retention=long",
    );

    // When its tags are read.
    const read = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({ Bucket: bucketName, Key: key }),
    );

    // Then the write's tags are the ones it carries.
    assertIdentical(tagsByKey(read.TagSet)["department"], "finance");
    assertIdentical(tagsByKey(read.TagSet)["retention"], "long");
  });

  it("replaces the whole tag set rather than adding to it", async () => {
    // Given an Object carrying two tags.
    const { simS3, bucketName, key } = await reportBucket(
      "department=finance&retention=long",
    );

    // When one tag is put on it.
    await simS3.putObjectTagging(
      new PutObjectTaggingCommand({
        Bucket: bucketName,
        Key: key,
        Tagging: { TagSet: [{ Key: "department", Value: "legal" }] },
      }),
    );

    // Then that is the only tag it carries.
    const read = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({ Bucket: bucketName, Key: key }),
    );

    assertArrayLength(read.TagSet, 1);
    assertIdentical(tagsByKey(read.TagSet)["department"], "legal");
  });

  it("takes every tag off an Object", async () => {
    // Given a tagged Object.
    const { simS3, bucketName, key } = await reportBucket(
      "department=finance&retention=long",
    );

    // When its tags are deleted.
    await simS3.deleteObjectTagging(
      new DeleteObjectTaggingCommand({ Bucket: bucketName, Key: key }),
    );

    // Then it carries none.
    const read = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({ Bucket: bucketName, Key: key }),
    );

    assertArrayEmpty(read.TagSet);
  });

  it("stores the tags a multipart upload named when it started", async () => {
    // Given a multipart upload started with a tag set.
    const simAws = new SimAws();
    const bucketName = `archives-${faker.string.uuid()}`;
    const simS3 = simAws.s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    const started = await simS3.createMultipartUpload(
      new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: "archive.zip",
        Tagging: "department=finance",
      }),
    );
    const part = await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: bucketName,
        Key: "archive.zip",
        UploadId: started.UploadId,
        PartNumber: 1,
        Body: "the whole archive",
      }),
    );

    // When the upload is completed.
    await simS3.completeMultipartUpload(
      new CompleteMultipartUploadCommand({
        Bucket: bucketName,
        Key: "archive.zip",
        UploadId: started.UploadId,
        MultipartUpload: { Parts: [{ PartNumber: 1, ETag: part.ETag }] },
      }),
    );

    // Then the Object it produced carries them.
    const read = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({ Bucket: bucketName, Key: "archive.zip" }),
    );

    assertIdentical(tagsByKey(read.TagSet)["department"], "finance");
  });

  it("carries the source Object's tags onto a copy", async () => {
    // Given a tagged Object.
    const { simS3, bucketName, key } = await reportBucket("department=finance");

    // When it is copied without a tagging directive.
    await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: bucketName,
        Key: `archive/${key}`,
        CopySource: `${bucketName}/${key}`,
      }),
    );

    // Then the copy carries the same tags.
    const read = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({
        Bucket: bucketName,
        Key: `archive/${key}`,
      }),
    );

    assertIdentical(tagsByKey(read.TagSet)["department"], "finance");
  });

  it("puts the request's own tags on a copy that replaces them", async () => {
    // Given a tagged Object.
    const { simS3, bucketName, key } = await reportBucket("department=finance");

    // When it is copied under `TaggingDirective: REPLACE`.
    await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: bucketName,
        Key: `archive/${key}`,
        CopySource: `${bucketName}/${key}`,
        TaggingDirective: "REPLACE",
        Tagging: "department=legal",
      }),
    );

    // Then the copy carries the request's tags and not the source's.
    const read = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({
        Bucket: bucketName,
        Key: `archive/${key}`,
      }),
    );

    assertArrayLength(read.TagSet, 1);
    assertIdentical(tagsByKey(read.TagSet)["department"], "legal");
  });
});

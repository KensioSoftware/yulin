import type { Readable } from "node:stream";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringEndsWith,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../../../util/type-guard/defined.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";
import {
  simS3MultipartETag,
  simS3ObjectETag,
  simS3QuotedETag,
} from "../../object/s3-object-etag.js";
import { SimS3 } from "../../sim-s3.js";

/**
 * Uploading a simulated S3 Object in parts.
 *
 * This is the path anything uploading a file of real size takes: the `aws` CLI
 * above eight megabytes, and `@aws-sdk/lib-storage` whatever the size. What
 * matters is that it ends in an ordinary Object, indistinguishable from one
 * written in a single PutObject except for the ETag, which says how it arrived.
 */
describe("Simulated S3 multipart upload", () => {
  const storedContent = async (body: Readable | undefined): Promise<string> => {
    assertDefined(body, "the read Object body");

    const buffer = await simS3BodyToBuffer(body);

    return buffer.toString("utf8");
  };

  const bucketWith = async (bucketName: string): Promise<SimS3> => {
    const simS3 = new SimS3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    return simS3;
  };

  const startedUpload = async (
    simS3: SimS3,
    bucketName: string,
    key: string,
  ): Promise<string> => {
    const started = await simS3.createMultipartUpload(
      new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: "application/octet-stream",
      }),
    );
    assertDefined(started.UploadId, "the issued upload id");

    return started.UploadId;
  };

  it("joins the parts in part-number order, whatever order they arrived in", async () => {
    // Given an upload whose parts are sent last one first, as a client sending
    // several at once routinely finishes them.
    const simS3 = await bucketWith("parts");
    const uploadId = await startedUpload(simS3, "parts", "joined.txt");

    const second = await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "parts",
        Key: "joined.txt",
        UploadId: uploadId,
        PartNumber: 2,
        Body: "world",
      }),
    );
    const first = await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "parts",
        Key: "joined.txt",
        UploadId: uploadId,
        PartNumber: 1,
        Body: "hello ",
      }),
    );

    // When the upload is completed.
    await simS3.completeMultipartUpload(
      new CompleteMultipartUploadCommand({
        Bucket: "parts",
        Key: "joined.txt",
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [
            { PartNumber: 1, ETag: first.ETag },
            { PartNumber: 2, ETag: second.ETag },
          ],
        },
      }),
    );

    // Then the Object holds the parts in the order they are numbered.
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "parts", Key: "joined.txt" }),
    );
    assertIdentical(await storedContent(read.Body), "hello world");
  });

  it("gives the completed Object the multipart ETag form", async () => {
    // Given an upload sent as two parts.
    const simS3 = await bucketWith("etags");
    const uploadId = await startedUpload(simS3, "etags", "big.bin");

    await Promise.all(
      ["one", "two"].map(
        async (content, index) =>
          await simS3.uploadPart(
            new UploadPartCommand({
              Bucket: "etags",
              Key: "big.bin",
              UploadId: uploadId,
              PartNumber: index + 1,
              Body: content,
            }),
          ),
      ),
    );

    // When it is completed.
    const completed = await simS3.completeMultipartUpload(
      new CompleteMultipartUploadCommand({
        Bucket: "etags",
        Key: "big.bin",
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [{ PartNumber: 1 }, { PartNumber: 2 }],
        },
      }),
    );

    // Then the ETag is `<md5-of-the-part-md5s>-<partCount>`, which is what a
    // tool comparing content hashes checks for before trusting one, and every
    // operation that reports an ETag agrees on it.
    const partETags = ["one", "two"].map((content) =>
      simS3ObjectETag(Buffer.from(content)),
    );
    const expected = simS3QuotedETag(simS3MultipartETag(partETags));
    assertIdentical(completed.ETag, expected);
    assertStringEndsWith(expected, '-2"');

    const head = await simS3.headObject(
      new HeadObjectCommand({ Bucket: "etags", Key: "big.bin" }),
    );
    assertIdentical(head.ETag, expected);

    const listed = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "etags" }),
    );
    assertIdentical(listed.Contents?.[0]?.ETag, expected);
  });

  it("keeps what the upload was started with on the finished Object", async () => {
    // Given an upload started with the metadata describing the Object, which is
    // where real S3 takes it: none of the bytes have arrived yet.
    const simS3 = await bucketWith("metadata");
    const started = await simS3.createMultipartUpload(
      new CreateMultipartUploadCommand({
        Bucket: "metadata",
        Key: "page.html",
        ContentType: "text/html",
        CacheControl: "max-age=60",
        Metadata: { author: "yulin" },
      }),
    );
    await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "metadata",
        Key: "page.html",
        UploadId: started.UploadId,
        PartNumber: 1,
        Body: "<h1>Home</h1>",
      }),
    );

    // When it is completed and read back.
    await simS3.completeMultipartUpload(
      new CompleteMultipartUploadCommand({
        Bucket: "metadata",
        Key: "page.html",
        UploadId: started.UploadId,
        MultipartUpload: { Parts: [{ PartNumber: 1 }] },
      }),
    );
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "metadata", Key: "page.html" }),
    );

    // Then the Object carries it, as one written by a PutObject would: the
    // system metadata in the fields a read describes an Object with, and the
    // user-defined metadata as it was given.
    assertIdentical(read.ContentType, "text/html");
    assertIdentical(read.CacheControl, "max-age=60");
    assertDefined(read.Metadata, "the read Object metadata");
    assertIdentical(read.Metadata["author"], "yulin");
  });

  it("puts nothing under the key until the upload is completed", async () => {
    // Given an upload with a part stored against it.
    const simS3 = await bucketWith("in-flight");
    const uploadId = await startedUpload(simS3, "in-flight", "pending.bin");
    await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "in-flight",
        Key: "pending.bin",
        UploadId: uploadId,
        PartNumber: 1,
        Body: "partial",
      }),
    );

    // When the Bucket is listed.
    const listed = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "in-flight" }),
    );

    // Then it holds nothing: a part is not an Object, and half an Object is
    // not something a reader should ever be offered.
    assertIdentical(listed.KeyCount, 0);
  });

  it("discards the parts when the upload is abandoned", async () => {
    // Given an upload with a part stored against it.
    const simS3 = await bucketWith("abandoned");
    const uploadId = await startedUpload(simS3, "abandoned", "gone.bin");
    await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "abandoned",
        Key: "gone.bin",
        UploadId: uploadId,
        PartNumber: 1,
        Body: "never finished",
      }),
    );

    // When it is aborted.
    await simS3.abortMultipartUpload(
      new AbortMultipartUploadCommand({
        Bucket: "abandoned",
        Key: "gone.bin",
        UploadId: uploadId,
      }),
    );

    // Then nothing is left: no Object under the key, and no upload holding
    // parts that nothing is ever going to finish.
    const listed = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "abandoned" }),
    );
    assertIdentical(listed.KeyCount, 0);

    const inFlight = await simS3.listMultipartUploads(
      new ListMultipartUploadsCommand({ Bucket: "abandoned" }),
    );
    assertUndefined(inFlight.Uploads);
  });

  it("reports what is in flight, and the parts one upload holds", async () => {
    // Given two uploads in progress, one of them with two parts stored.
    const simS3 = await bucketWith("in-progress");
    const uploadId = await startedUpload(simS3, "in-progress", "a/one.bin");
    await startedUpload(simS3, "in-progress", "b/two.bin");

    await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "in-progress",
        Key: "a/one.bin",
        UploadId: uploadId,
        PartNumber: 2,
        Body: "second",
      }),
    );
    await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "in-progress",
        Key: "a/one.bin",
        UploadId: uploadId,
        PartNumber: 1,
        Body: "first",
      }),
    );

    // When the uploads and one upload's parts are listed.
    const uploads = await simS3.listMultipartUploads(
      new ListMultipartUploadsCommand({ Bucket: "in-progress" }),
    );
    const parts = await simS3.listParts(
      new ListPartsCommand({
        Bucket: "in-progress",
        Key: "a/one.bin",
        UploadId: uploadId,
      }),
    );

    // Then both uploads are reported, keyed by what they will become.
    assertNonNullable(uploads.Uploads);
    assertArrayLength(uploads.Uploads, 2);
    assertIdentical(uploads.Uploads[0].Key, "a/one.bin");
    assertIdentical(uploads.Uploads[0].UploadId, uploadId);
    assertFalse(uploads.IsTruncated);

    // And the parts come back in part-number order with the size each holds,
    // which is what a client resuming an upload works from.
    assertNonNullable(parts.Parts);
    assertArrayLength(parts.Parts, 2);
    assertIdentical(parts.Parts[0].PartNumber, 1);
    assertIdentical(parts.Parts[0].Size, 5);
    assertIdentical(parts.Parts[1].PartNumber, 2);
    assertIdentical(parts.Parts[1].Size, 6);
  });

  it("narrows a listing of uploads to a prefix", async () => {
    // Given uploads in progress under two prefixes.
    const simS3 = await bucketWith("prefixed");
    await startedUpload(simS3, "prefixed", "images/one.png");
    await startedUpload(simS3, "prefixed", "video/one.mp4");

    // When the uploads under one prefix are listed.
    const listed = await simS3.listMultipartUploads(
      new ListMultipartUploadsCommand({
        Bucket: "prefixed",
        Prefix: "images/",
      }),
    );

    // Then only that one comes back.
    assertNonNullable(listed.Uploads);
    assertArrayLength(listed.Uploads, 1);
    assertIdentical(listed.Uploads[0].Key, "images/one.png");
  });

  it("takes the last part sent under a number, so a resend wins", async () => {
    // Given a part sent twice, as a client unsure the first attempt arrived
    // will do.
    const simS3 = await bucketWith("resent");
    const uploadId = await startedUpload(simS3, "resent", "retried.txt");

    await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "resent",
        Key: "retried.txt",
        UploadId: uploadId,
        PartNumber: 1,
        Body: "first attempt",
      }),
    );
    const resent = await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "resent",
        Key: "retried.txt",
        UploadId: uploadId,
        PartNumber: 1,
        Body: "second attempt",
      }),
    );

    // When the upload is completed naming the ETag the resend answered with.
    await simS3.completeMultipartUpload(
      new CompleteMultipartUploadCommand({
        Bucket: "resent",
        Key: "retried.txt",
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [{ PartNumber: 1, ETag: resent.ETag }],
        },
      }),
    );

    // Then the Object holds what arrived last.
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "resent", Key: "retried.txt" }),
    );
    assertIdentical(await storedContent(read.Body), "second attempt");
  });
});

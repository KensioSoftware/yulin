import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  PutBucketPolicyCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimS3 } from "../../sim-s3.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * What simulated S3 refuses during a multipart upload.
 *
 * An upload that goes wrong should go wrong the way it does against AWS, so
 * that retry and cleanup code written against these errors is exercised rather
 * than merely compiled. The alternative is worse than an absent feature: an
 * Object assembled from whichever parts happened to arrive is a confident
 * wrong answer.
 */
describe("Simulated S3 multipart upload refusals", () => {
  const bucketWith = async (bucketName: string): Promise<SimS3> => {
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    return simS3;
  };

  const startedUpload = async (
    simS3: SimS3,
    bucketName: string,
    key: string,
  ): Promise<string> => {
    const started = await simS3.createMultipartUpload(
      new CreateMultipartUploadCommand({ Bucket: bucketName, Key: key }),
    );
    assertDefined(started.UploadId, "the issued upload id");

    return started.UploadId;
  };

  it("refuses an upload id it never issued", async () => {
    // Given a Bucket with no upload in progress.
    const simS3 = await bucketWith("unknown-uploads");

    // When an upload id nothing issued is completed.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simS3.completeMultipartUpload(
          new CompleteMultipartUploadCommand({
            Bucket: "unknown-uploads",
            Key: "invented.bin",
            UploadId: "not-an-upload",
            MultipartUpload: { Parts: [{ PartNumber: 1 }] },
          }),
        ),
    );

    // Then S3's own error is raised, which is what a client retrying an upload
    // it has lost track of reads to know it has to start again.
    assertIdentical(error.name, "NoSuchUpload");
  });

  it("refuses an upload id that has already been used up", async () => {
    // Given an upload that was aborted.
    const simS3 = await bucketWith("spent-uploads");
    const uploadId = await startedUpload(simS3, "spent-uploads", "gone.bin");
    await simS3.abortMultipartUpload(
      new AbortMultipartUploadCommand({
        Bucket: "spent-uploads",
        Key: "gone.bin",
        UploadId: uploadId,
      }),
    );

    // When its parts are listed.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simS3.listParts(
          new ListPartsCommand({
            Bucket: "spent-uploads",
            Key: "gone.bin",
            UploadId: uploadId,
          }),
        ),
    );

    // Then it is as unknown as an invented id: real S3 keeps nothing about an
    // upload that has stopped being one.
    assertIdentical(error.name, "NoSuchUpload");
  });

  it("refuses a completion naming a part that was never uploaded", async () => {
    // Given an upload holding one part.
    const simS3 = await bucketWith("missing-parts");
    const uploadId = await startedUpload(simS3, "missing-parts", "gappy.bin");
    await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "missing-parts",
        Key: "gappy.bin",
        UploadId: uploadId,
        PartNumber: 1,
        Body: "one",
      }),
    );

    // When the completion names a second part that never arrived.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simS3.completeMultipartUpload(
          new CompleteMultipartUploadCommand({
            Bucket: "missing-parts",
            Key: "gappy.bin",
            UploadId: uploadId,
            MultipartUpload: {
              Parts: [{ PartNumber: 1 }, { PartNumber: 2 }],
            },
          }),
        ),
    );

    // Then it is refused rather than assembled from what was there, which
    // would have stored an Object silently missing its second half.
    assertIdentical(error.name, "InvalidPart");
    assertStringIncludes(error.message, "part 2");
  });

  it("refuses a completion naming an ETag other than the one it stored", async () => {
    // Given an upload holding one part.
    const simS3 = await bucketWith("wrong-etags");
    const uploadId = await startedUpload(simS3, "wrong-etags", "one.bin");
    await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "wrong-etags",
        Key: "one.bin",
        UploadId: uploadId,
        PartNumber: 1,
        Body: "content",
      }),
    );

    // When the completion names it by an ETag it was not stored under.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simS3.completeMultipartUpload(
          new CompleteMultipartUploadCommand({
            Bucket: "wrong-etags",
            Key: "one.bin",
            UploadId: uploadId,
            MultipartUpload: {
              Parts: [
                {
                  PartNumber: 1,
                  ETag: '"d41d8cd98f00b204e9800998ecf8427e"',
                },
              ],
            },
          }),
        ),
    );

    // Then S3 says the client is naming a part other than the one it holds.
    assertIdentical(error.name, "InvalidPart");
  });

  it("refuses a completion listing its parts out of order", async () => {
    // Given an upload holding two parts, sent in either order.
    const simS3 = await bucketWith("unordered");
    const uploadId = await startedUpload(simS3, "unordered", "swapped.bin");

    await Promise.all(
      [1, 2].map(
        async (partNumber) =>
          await simS3.uploadPart(
            new UploadPartCommand({
              Bucket: "unordered",
              Key: "swapped.bin",
              UploadId: uploadId,
              PartNumber: partNumber,
              Body: `part ${partNumber}`,
            }),
          ),
      ),
    );

    // When the completion lists them the other way round.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simS3.completeMultipartUpload(
          new CompleteMultipartUploadCommand({
            Bucket: "unordered",
            Key: "swapped.bin",
            UploadId: uploadId,
            MultipartUpload: {
              Parts: [{ PartNumber: 2 }, { PartNumber: 1 }],
            },
          }),
        ),
    );

    // Then it is refused rather than sorted, as real S3 refuses it. Accepting
    // it here would pass a test that fails against AWS.
    assertIdentical(error.name, "InvalidPartOrder");
  });

  it("refuses a completion naming no parts at all", async () => {
    // Given an upload in progress.
    const simS3 = await bucketWith("empty-completions");
    const uploadId = await startedUpload(
      simS3,
      "empty-completions",
      "nothing.bin",
    );

    // When it is completed with an empty part list.
    const empty = await assertThrowsErrorAsync(
      async () =>
        await simS3.completeMultipartUpload(
          new CompleteMultipartUploadCommand({
            Bucket: "empty-completions",
            Key: "nothing.bin",
            UploadId: uploadId,
            MultipartUpload: { Parts: [] },
          }),
        ),
    );

    // Then S3 refuses the request document rather than storing an empty Object.
    assertIdentical(empty.name, "MalformedXML");

    // And a completion that leaves the part list out altogether is the same
    // refusal, rather than S3 assuming every part it happens to hold.
    const omitted = await assertThrowsErrorAsync(
      async () =>
        await simS3.completeMultipartUpload(
          new CompleteMultipartUploadCommand({
            Bucket: "empty-completions",
            Key: "nothing.bin",
            UploadId: uploadId,
          }),
        ),
    );
    assertIdentical(omitted.name, "MalformedXML");
  });

  it("refuses a Bucket that is not there before anything else", async () => {
    // Given a simulated S3 with no Buckets.
    const simS3 = new SimAws().s3();

    // When an upload is started against a Bucket that does not exist.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simS3.createMultipartUpload(
          new CreateMultipartUploadCommand({
            Bucket: "absent",
            Key: "one.bin",
          }),
        ),
    );

    // Then it is the missing-Bucket error, as every other Bucket-scoped
    // operation answers with.
    assertIdentical(error.name, "NoSuchBucket");
  });

  it("authorizes each operation the way PutObject is authorized", async () => {
    // Given a Bucket whose policy denies writes to the key being uploaded, and
    // a caller subject to it.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "denied" }));
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "denied",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Deny",
              Principal: "*",
              Action: "s3:PutObject",
              Resource: "arn:aws:s3:::denied/locked.bin",
            },
          ],
        }),
      }),
    );

    // When an upload of that key is started.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simS3.createMultipartUpload(
          new CreateMultipartUploadCommand({
            Bucket: "denied",
            Key: "locked.bin",
          }),
          { caller: { kind: "service", service: "cloudfront.amazonaws.com" } },
        ),
    );

    // Then it is denied at the start rather than after the parts have been
    // uploaded, on the Object ARN and under the action PutObject uses.
    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "s3:PutObject");
    assertStringIncludes(error.message, "arn:aws:s3:::denied/locked.bin");
  });
});

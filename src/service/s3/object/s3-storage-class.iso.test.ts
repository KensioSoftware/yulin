import {
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimS3InvalidStorageClass } from "../error/sim-s3.error.js";
import type { SimS3 } from "../sim-s3.js";

/**
 * A Bucket to write Objects into.
 */
async function archiveSimulation(): Promise<SimS3> {
  const simS3 = new SimAws().region("eu-west-2").s3();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: "archive" }));

  return simS3;
}

/**
 * The class a listing reports for one key.
 */
async function listedClass(
  simS3: SimS3,
  key: string,
): Promise<string | undefined> {
  const listing = await simS3.listObjectsV2(
    new ListObjectsV2Command({ Bucket: "archive" }),
  );

  return (listing.Contents ?? []).find((entry) => entry.Key === key)
    ?.StorageClass;
}

/**
 * The storage class a simulated S3 Object is written in and read back under.
 */
describe("Simulated S3 Object storage classes", () => {
  it("stores an Object in the class its write names", async () => {
    // Given a Bucket.
    const simS3 = await archiveSimulation();

    // When an Object is written into one of the archival classes.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "archive",
        Key: "ledgers/2026.csv",
        Body: "a,b",
        StorageClass: "GLACIER",
      }),
    );

    // Then every way of asking about it says where it is.
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "archive", Key: "ledgers/2026.csv" }),
    );
    const head = await simS3.headObject(
      new HeadObjectCommand({ Bucket: "archive", Key: "ledgers/2026.csv" }),
    );

    assertIdentical(read.StorageClass, "GLACIER");
    assertIdentical(head.StorageClass, "GLACIER");
    assertIdentical(await listedClass(simS3, "ledgers/2026.csv"), "GLACIER");
  });

  it("leaves the class out of a read of a Standard Object", async () => {
    // Given an Object written without a class named.
    const simS3 = await archiveSimulation();
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "archive",
        Key: "ledgers/current.csv",
        Body: "a,b",
      }),
    );

    // When it is read and asked about.
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "archive", Key: "ledgers/current.csv" }),
    );
    const head = await simS3.headObject(
      new HeadObjectCommand({ Bucket: "archive", Key: "ledgers/current.csv" }),
    );

    // Then neither reports a class, as real S3 leaves the header off a
    // Standard Object, and a listing still names the class it is in.
    assertUndefined(read.StorageClass);
    assertUndefined(head.StorageClass);
    assertIdentical(
      await listedClass(simS3, "ledgers/current.csv"),
      "STANDARD",
    );
  });

  it("refuses a write naming a class S3 has no such class for", async () => {
    // Given a Bucket.
    const simS3 = await archiveSimulation();

    // When a write names something that is not a storage class.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putObject(
        new PutObjectCommand({
          Bucket: "archive",
          Key: "ledgers/2026.csv",
          Body: "a,b",
          StorageClass: "PERMAFROST" as "GLACIER",
        }),
      ),
    );

    // Then it is refused, and nothing was stored under the key.
    assertInstanceOf(error, SimS3InvalidStorageClass);
    assertStringIncludes(error.message, "PERMAFROST");
    assertUndefined(await listedClass(simS3, "ledgers/2026.csv"));
  });

  it("stores a copy in the class the copy names", async () => {
    // Given an Object in an archival class.
    const simS3 = await archiveSimulation();
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "archive",
        Key: "ledgers/2026.csv",
        Body: "a,b",
        StorageClass: "DEEP_ARCHIVE",
      }),
    );

    // When it is copied twice, once naming a class and once not.
    await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: "archive",
        Key: "ledgers/2026-working.csv",
        CopySource: "archive/ledgers/2026.csv",
      }),
    );
    await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: "archive",
        Key: "ledgers/2026-cold.csv",
        CopySource: "archive/ledgers/2026.csv",
        StorageClass: "GLACIER_IR",
      }),
    );

    // Then the copy that named none is Standard rather than the source's
    // class, which is what real S3 stores a copy as.
    assertIdentical(
      await listedClass(simS3, "ledgers/2026-working.csv"),
      "STANDARD",
    );
    assertIdentical(
      await listedClass(simS3, "ledgers/2026-cold.csv"),
      "GLACIER_IR",
    );
  });

  it("completes a multipart upload into the class it was started in", async () => {
    // Given an upload started in an infrequent access class.
    const simS3 = await archiveSimulation();
    const upload = await simS3.createMultipartUpload(
      new CreateMultipartUploadCommand({
        Bucket: "archive",
        Key: "ledgers/large.csv",
        StorageClass: "STANDARD_IA",
      }),
    );
    const part = await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "archive",
        Key: "ledgers/large.csv",
        UploadId: upload.UploadId,
        PartNumber: 1,
        Body: "a,b",
      }),
    );

    // When the upload is completed.
    await simS3.completeMultipartUpload(
      new CompleteMultipartUploadCommand({
        Bucket: "archive",
        Key: "ledgers/large.csv",
        UploadId: upload.UploadId,
        MultipartUpload: { Parts: [{ PartNumber: 1, ETag: part.ETag }] },
      }),
    );

    // Then the Object it made is in the class the upload named, which real S3
    // takes at the start of an upload rather than at its completion.
    assertIdentical(
      await listedClass(simS3, "ledgers/large.csv"),
      "STANDARD_IA",
    );
  });
});

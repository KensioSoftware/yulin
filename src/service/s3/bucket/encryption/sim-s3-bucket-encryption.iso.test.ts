import {
  CreateBucketCommand,
  DeleteBucketEncryptionCommand,
  GetBucketEncryptionCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketEncryptionCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3InvalidArgument } from "../../error/sim-s3.error.js";
import type { SimS3 } from "../../sim-s3.js";

/**
 * A Bucket to write Objects into.
 */
async function documentSimulation(): Promise<SimS3> {
  const simS3 = new SimAws().region("eu-west-2").s3();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: "documents" }));

  return simS3;
}

/**
 * The algorithm a Bucket's configuration reports.
 */
async function configuredAlgorithm(simS3: SimS3): Promise<string | undefined> {
  const read = await simS3.getBucketEncryption(
    new GetBucketEncryptionCommand({ Bucket: "documents" }),
  );

  return read.ServerSideEncryptionConfiguration?.Rules?.[0]
    ?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm;
}

/**
 * The default encryption of a simulated S3 Bucket, and what it stamps on the
 * Objects written into it.
 *
 * Nothing is encrypted. The bytes are stored as they arrive, and what these
 * cover is what S3 says about them.
 */
describe("Simulated S3 Bucket encryption", () => {
  it("reports SSE-S3 for a Bucket nobody has configured", async () => {
    // Given a Bucket with no encryption configuration of its own.
    const simS3 = await documentSimulation();

    // When its encryption is read.
    const algorithm = await configuredAlgorithm(simS3);

    // Then it is the SSE-S3 default real S3 has applied to every Bucket since
    // January 2023, rather than an error or an empty answer.
    assertIdentical(algorithm, "AES256");
  });

  it("stamps a Bucket's default on an Object written without one", async () => {
    // Given a Bucket configured for KMS.
    const simS3 = await documentSimulation();
    await simS3.putBucketEncryption(
      new PutBucketEncryptionCommand({
        Bucket: "documents",
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms" },
              BucketKeyEnabled: true,
            },
          ],
        },
      }),
    );

    // When an Object is written without naming an algorithm.
    const written = await simS3.putObject(
      new PutObjectCommand({
        Bucket: "documents",
        Key: "contracts/one.pdf",
        Body: "one",
      }),
    );

    // Then the write and both reads report the Bucket's algorithm, and the
    // ETag is still the digest of the bytes as it is under SSE-S3.
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "documents", Key: "contracts/one.pdf" }),
    );
    const head = await simS3.headObject(
      new HeadObjectCommand({ Bucket: "documents", Key: "contracts/one.pdf" }),
    );

    assertIdentical(written.ServerSideEncryption, "aws:kms");
    assertIdentical(read.ServerSideEncryption, "aws:kms");
    assertIdentical(head.ServerSideEncryption, "aws:kms");
    assertIdentical(read.ETag, '"f97c5d29941bfb1b2fdab0874906ab82"');
  });

  it("lets a write name its own algorithm over the Bucket's", async () => {
    // Given a Bucket configured for KMS.
    const simS3 = await documentSimulation();
    await simS3.putBucketEncryption(
      new PutBucketEncryptionCommand({
        Bucket: "documents",
        ServerSideEncryptionConfiguration: {
          Rules: [
            { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms" } },
          ],
        },
      }),
    );

    // When an Object is written naming SSE-S3.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "documents",
        Key: "contracts/two.pdf",
        Body: "two",
        ServerSideEncryption: "AES256",
      }),
    );

    // Then the write has the last word.
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "documents", Key: "contracts/two.pdf" }),
    );

    assertIdentical(read.ServerSideEncryption, "AES256");
  });

  it("keeps what an Object was written with when the Bucket changes", async () => {
    // Given an Object written into an unconfigured Bucket.
    const simS3 = await documentSimulation();
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "documents",
        Key: "contracts/old.pdf",
        Body: "old",
      }),
    );

    // When the Bucket is configured for KMS afterwards.
    await simS3.putBucketEncryption(
      new PutBucketEncryptionCommand({
        Bucket: "documents",
        ServerSideEncryptionConfiguration: {
          Rules: [
            { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms" } },
          ],
        },
      }),
    );

    // Then the Object still reports what it was stored under, as real S3
    // leaves the Objects already in a Bucket alone.
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "documents", Key: "contracts/old.pdf" }),
    );

    assertIdentical(read.ServerSideEncryption, "AES256");
  });

  it("puts a Bucket back to SSE-S3 when its configuration is removed", async () => {
    // Given a Bucket configured for KMS.
    const simS3 = await documentSimulation();
    await simS3.putBucketEncryption(
      new PutBucketEncryptionCommand({
        Bucket: "documents",
        ServerSideEncryptionConfiguration: {
          Rules: [
            { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms" } },
          ],
        },
      }),
    );

    // When the configuration is removed.
    await simS3.deleteBucketEncryption(
      new DeleteBucketEncryptionCommand({ Bucket: "documents" }),
    );

    // Then the Bucket is SSE-S3 encrypted rather than unencrypted, because
    // there is no such thing as an unencrypted Bucket.
    assertIdentical(await configuredAlgorithm(simS3), "AES256");
  });

  it("refuses a configuration naming an algorithm S3 does not apply", async () => {
    // Given a Bucket.
    const simS3 = await documentSimulation();

    // When a configuration names something that is not an algorithm.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketEncryption(
        new PutBucketEncryptionCommand({
          Bucket: "documents",
          ServerSideEncryptionConfiguration: {
            Rules: [
              {
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: "ROT13" as "AES256",
                },
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused, and the Bucket is left as it was.
    assertInstanceOf(error, SimS3InvalidArgument);
    assertStringIncludes(error.message, "ROT13");
    assertIdentical(await configuredAlgorithm(simS3), "AES256");
  });
});

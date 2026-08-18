import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
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

/**
 * Asking whether an Object or a Bucket is there, without reading it.
 *
 * A HEAD response carries no body, so everything a caller learns is the status
 * and the headers. That is what makes the error shape matter here.
 */
describe("Simulated S3 HEAD operations", () => {
  async function simulationWithObject(): Promise<SimAws> {
    const simAws = new SimAws();
    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "widgets" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "widgets",
        Key: "one.txt",
        Body: "twelve chars",
        ContentType: "text/plain",
      }),
    );

    return simAws;
  }

  it("reports an Object's size, ETag and metadata without its body", async () => {
    // Given a Bucket holding an Object
    const simAws = await simulationWithObject();

    // When it is asked about rather than read
    const head = await simAws
      .s3()
      .headObject(new HeadObjectCommand({ Bucket: "widgets", Key: "one.txt" }));

    // Then it describes the Object that a read would have returned
    assertIdentical(head.ContentLength, 12);
    assertStringIncludes(head.ETag ?? "", '"');
    assertInstanceOf(head.LastModified, Date);
  });

  it("reports an absent Object as NotFound rather than NoSuchKey", async () => {
    // Given a Bucket with nothing under the key asked for
    const simAws = await simulationWithObject();

    // When an absent Object is asked about
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .s3()
          .headObject(
            new HeadObjectCommand({ Bucket: "widgets", Key: "gone" }),
          ),
    );

    // Then the error is the one real S3 answers a HEAD with. A read answers
    // NoSuchKey, which a HEAD has no body to say.
    assertIdentical(error.name, "NotFound");
  });

  it("reports an absent Bucket as NotFound for both operations", async () => {
    // Given a simulation with no Buckets at all
    const simAws = new SimAws();

    const bucketError = await assertThrowsErrorAsync(
      async () =>
        await simAws.s3().headBucket(new HeadBucketCommand({ Bucket: "gone" })),
    );
    const objectError = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .s3()
          .headObject(new HeadObjectCommand({ Bucket: "gone", Key: "one" })),
    );

    // Then neither leaks which of the two was missing
    assertIdentical(bucketError.name, "NotFound");
    assertIdentical(objectError.name, "NotFound");
  });

  it("answers a Bucket that is there with the Region it was found in", async () => {
    // Given a Bucket in a known Region
    const simAws = new SimAws();
    const simS3 = simAws.region("eu-west-2").s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "widgets" }));

    // When it is asked about
    const head = await simS3.headBucket(
      new HeadBucketCommand({ Bucket: "widgets" }),
    );

    // Then the Region comes back, as real S3 reports it
    assertIdentical(head.BucketRegion, "eu-west-2");
  });
});

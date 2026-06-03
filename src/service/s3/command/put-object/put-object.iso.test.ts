import { describe, it } from "vitest";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertBufferEqual,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import type { SimS3BucketName } from "../../bucket/s3-bucket.js";
import { SimAws } from "../../../aws/sim-aws.js";

describe("S3 PutObjectCommand", () => {
  it("puts an Object into an S3 Bucket", async () => {
    const simAws = new SimAws();
    const simS3 = simAws.s3();

    const bucketName = "bucket-a" as SimS3BucketName;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "foo.txt",
        Body: "Hello, world!",
        Metadata: {
          foo: "bar",
        },
      }),
    );

    const simBucket = simS3.getSimBucketByName(bucketName);
    const simObject = await simBucket.getObject("foo.txt");

    assertNonNullable(simObject);
    assertIdentical(simObject.key, "foo.txt");
    assertBufferEqual(simObject.body, Buffer.from("Hello, world!"));
    assertIdentical(simObject.metadata.values["foo"], "bar");
  });

  it("puts an Object with Uint8Array body", async () => {
    const simAws = new SimAws();
    const simS3 = simAws.s3();

    const bucketName = "bucket-a" as SimS3BucketName;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "foo.bin",
        Body: new Uint8Array([1, 2, 3]),
      }),
    );

    const simBucket = simS3.getSimBucketByName(bucketName);
    const simObject = await simBucket.getObject("foo.bin");

    assertNonNullable(simObject);
    assertBufferEqual(simObject.body, Buffer.from([1, 2, 3]));
  });

  it("rejects undefined bucket name", async () => {
    const simAws = new SimAws();
    const simS3 = simAws.s3();

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.putObject(
        new PutObjectCommand({
          Bucket: undefined,
          Key: "foo.txt",
        }),
      );
    });

    assertStringIncludes(error.message, "PutObjectCommand.input.Bucket");
  });

  it("rejects undefined object key", async () => {
    const simAws = new SimAws();
    const simS3 = simAws.s3();

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: undefined,
        }),
      );
    });

    assertStringIncludes(error.message, "PutObjectCommand.input.Key");
  });

  it("rejects non-existent bucket", async () => {
    const simAws = new SimAws();
    const simS3 = simAws.s3();

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.putObject(
        new PutObjectCommand({
          Bucket: "bucket-a",
          Key: "foo.txt",
        }),
      );
    });

    assertStringIncludes(error.message, "No S3 Bucket named bucket-a");
  });

  it("rejects unsupported body type", async () => {
    const simAws = new SimAws();
    const simS3 = simAws.s3();

    const bucketName = "bucket-a" as SimS3BucketName;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.putObject(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: "foo.txt",
          Body: 123 as unknown as Uint8Array,
        }),
      );
    });

    assertStringIncludes(
      error.message,
      "PutObjectCommand.input.Body must be a string or Uint8Array",
    );
  });
});

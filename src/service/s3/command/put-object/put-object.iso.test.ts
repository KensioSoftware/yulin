import { describe, it } from "vitest";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { Readable } from "node:stream";
import type { SimS3BucketName } from "../../bucket/s3-bucket.js";
import { installSimS3 } from "../../install/install-sim-s3.js";

describe("S3 PutObjectCommand", () => {
  it("puts an Object into an S3 Bucket", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);

    const simS3 = simAws.service("s3");

    const bucketName = "bucket-a";

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

    const getObjectOutput = await simS3.getObject(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: "foo.txt",
      }),
    );

    assertInstanceOf(getObjectOutput.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(getObjectOutput.Body),
      Buffer.from("Hello, world!"),
    );
    assertIdentical(getObjectOutput.Metadata?.["foo"], "bar");
  });

  it("puts an Object with Uint8Array body", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);

    const simS3 = simAws.service("s3");

    const bucketName = "bucket-a";

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "foo.bin",
        Body: new Uint8Array([1, 2, 3]),
      }),
    );

    const getObjectOutput = await simS3.getObject(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: "foo.bin",
      }),
    );

    assertInstanceOf(getObjectOutput.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(getObjectOutput.Body),
      Buffer.from([1, 2, 3]),
    );
  });

  it("rejects undefined bucket name", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);

    const simS3 = simAws.service("s3");

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
    installSimS3(simAws);

    const simS3 = simAws.service("s3");

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
    installSimS3(simAws);

    const simS3 = simAws.service("s3");

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
    installSimS3(simAws);

    const simS3 = simAws.service("s3");

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

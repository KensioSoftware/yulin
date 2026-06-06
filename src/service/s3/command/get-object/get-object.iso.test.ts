import { describe, it } from "vitest";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { installSimS3 } from "../../install/install-sim-s3.js";

describe("S3 GetObjectCommand", () => {
  it("gets an Object from an S3 Bucket", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);

    const simS3 = simAws.service("s3");

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "foo.txt",
        Body: "Hello, world!",
        Metadata: {
          foo: "bar",
        },
      }),
    );

    const getObjectOutput = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "bucket-a",
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

  it("rejects undefined bucket name", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);

    const simS3 = simAws.service("s3");

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.getObject(
        new GetObjectCommand({
          Bucket: undefined,
          Key: "foo.txt",
        }),
      );
    });

    assertStringIncludes(error.message, "GetObjectCommand.input.Bucket");
  });

  it("rejects undefined object key", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);

    const simS3 = simAws.service("s3");

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.getObject(
        new GetObjectCommand({
          Bucket: "bucket-a",
          Key: undefined,
        }),
      );
    });

    assertStringIncludes(error.message, "GetObjectCommand.input.Key");
  });

  it("rejects non-existent bucket", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);

    const simS3 = simAws.service("s3");

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.getObject(
        new GetObjectCommand({
          Bucket: "bucket-a",
          Key: "foo.txt",
        }),
      );
    });

    assertStringIncludes(error.message, "No S3 Bucket named bucket-a");
  });

  it("rejects non-existent object", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);

    const simS3 = simAws.service("s3");

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    const error = await assertThrowsErrorAsync(async () => {
      await simS3.getObject(
        new GetObjectCommand({
          Bucket: "bucket-a",
          Key: "foo.txt",
        }),
      );
    });

    assertStringIncludes(error.message, "No S3 Object named foo.txt");
  });
});

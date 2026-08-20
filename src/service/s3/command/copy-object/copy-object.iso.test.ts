import {
  CopyObjectCommand,
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { Readable } from "node:stream";
import { describe, it } from "vitest";

import { SimSdk } from "../../../../sdk/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";

describe("S3 CopyObjectCommand", () => {
  it("copies an Object to another key in the same Bucket", async () => {
    // Given an Object a caller wants to rename.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const bucketName = `documents-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "draft.txt",
        Body: "the report",
      }),
    );

    // When it is copied to the name it should have.
    await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: bucketName,
        Key: "final.txt",
        CopySource: `${bucketName}/draft.txt`,
      }),
    );

    // Then both keys hold the same bytes, because a copy leaves the source.
    const copied = await simS3.getObject(
      new GetObjectCommand({ Bucket: bucketName, Key: "final.txt" }),
    );
    const original = await simS3.getObject(
      new GetObjectCommand({ Bucket: bucketName, Key: "draft.txt" }),
    );

    assertInstanceOf(copied.Body, Readable);
    assertInstanceOf(original.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(copied.Body),
      Buffer.from("the report"),
    );
    assertBufferEqual(
      await simS3BodyToBuffer(original.Body),
      Buffer.from("the report"),
    );
  });

  it("copies an Object into another Bucket and reports its ETag", async () => {
    // Given an Object in the Bucket an archive is taken from.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const inbox = `inbox-${faker.string.uuid()}`;
    const archive = `archive-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: inbox }));
    await simS3.createBucket(new CreateBucketCommand({ Bucket: archive }));

    const put = await simS3.putObject(
      new PutObjectCommand({
        Bucket: inbox,
        Key: "report.pdf",
        Body: "quarterly figures",
      }),
    );

    // When it is copied into the archive Bucket under a dated key.
    const copy = await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: archive,
        Key: "2026/report.pdf",
        CopySource: `${inbox}/report.pdf`,
      }),
    );

    // Then the copy carries the same content ETag the source was stored under.
    assertIdentical(copy.CopyObjectResult?.ETag, put.ETag);
    assertInstanceOf(copy.CopyObjectResult?.LastModified, Date);

    const copied = await simS3.getObject(
      new GetObjectCommand({ Bucket: archive, Key: "2026/report.pdf" }),
    );
    assertInstanceOf(copied.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(copied.Body),
      Buffer.from("quarterly figures"),
    );
  });

  it("carries the source's metadata across by default", async () => {
    // Given an Object described by both user and system metadata.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const bucketName = `assets-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "logo.svg",
        Body: "<svg />",
        ContentType: "image/svg+xml",
        Metadata: { designer: "in-house" },
      }),
    );

    // When it is copied without saying what the copy's metadata should be.
    await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: bucketName,
        Key: "logo-backup.svg",
        CopySource: `${bucketName}/logo.svg`,
      }),
    );

    // Then the copy is described the same way the source was.
    const copied = await simS3.getObject(
      new GetObjectCommand({ Bucket: bucketName, Key: "logo-backup.svg" }),
    );

    const metadata = copied.Metadata ?? {};
    assertIdentical(metadata["content-type"], "image/svg+xml");
    assertIdentical(metadata["designer"], "in-house");
  });

  it("takes the copy's metadata from the request under REPLACE", async () => {
    // Given an Object whose metadata is about to be corrected in place.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const bucketName = `assets-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "page.html",
        Body: "<p>hello</p>",
        ContentType: "application/octet-stream",
        Metadata: { stale: "yes" },
      }),
    );

    // When it is copied over itself with a directive to replace the metadata.
    await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: bucketName,
        Key: "page.html",
        CopySource: `${bucketName}/page.html`,
        MetadataDirective: "REPLACE",
        ContentType: "text/html",
        Metadata: { reviewed: "2026-08" },
      }),
    );

    // Then the request's metadata is what the Object now carries, and the
    // source's is gone rather than merged with it.
    const copied = await simS3.getObject(
      new GetObjectCommand({ Bucket: bucketName, Key: "page.html" }),
    );

    const metadata = copied.Metadata ?? {};
    assertIdentical(metadata["content-type"], "text/html");
    assertIdentical(metadata["reviewed"], "2026-08");
    assertUndefined(metadata["stale"]);
  });

  it("copies a key holding a slash and a space", async () => {
    // Given an Object under a key the SDK has to encode into the source.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const bucketName = `uploads-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "invoices/2026 Q1/summary.csv",
        Body: "total,100",
      }),
    );

    // When it is copied with the source URL-encoded, as real S3 requires.
    await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: bucketName,
        Key: "invoices/latest.csv",
        CopySource: `/${bucketName}/invoices/2026%20Q1/summary.csv`,
      }),
    );

    // Then the encoded source named the Object it was meant to.
    const copied = await simS3.getObject(
      new GetObjectCommand({ Bucket: bucketName, Key: "invoices/latest.csv" }),
    );

    assertInstanceOf(copied.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(copied.Body),
      Buffer.from("total,100"),
    );
  });

  it("leaves the copy unchanged when the source's bytes are written into", async () => {
    // Given an Object that has been copied.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    const bucketName = `uploads-${faker.string.uuid()}`;

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "source.bin",
        Body: new Uint8Array([1, 2, 3]),
      }),
    );
    await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: bucketName,
        Key: "copy.bin",
        CopySource: `${bucketName}/source.bin`,
      }),
    );

    // When the source Object is replaced with different bytes.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "source.bin",
        Body: new Uint8Array([9, 9, 9]),
      }),
    );

    // Then the copy still holds what it was copied from.
    const copied = await simS3.getObject(
      new GetObjectCommand({ Bucket: bucketName, Key: "copy.bin" }),
    );

    assertInstanceOf(copied.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(copied.Body),
      Buffer.from([1, 2, 3]),
    );
  });

  it("copies through an intercepted SDK client", async () => {
    // Given an S3 client whose Commands reach the simulation.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `intercepted-${faker.string.uuid()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "one.txt",
        Body: "intercepted",
      }),
    );

    // When the client sends a copy.
    const copy = await client.send(
      new CopyObjectCommand({
        Bucket: bucketName,
        Key: "two.txt",
        CopySource: `${bucketName}/one.txt`,
      }),
    );

    // Then the Command was routed and the copy is readable.
    assertStringIncludes(copy.CopyObjectResult?.ETag ?? "", '"');

    const copied = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: "two.txt" }),
    );
    assertIdentical(await copied.Body?.transformToString(), "intercepted");
  });
});

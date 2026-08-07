import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  presignBucketName,
  presignSimulation,
} from "../../../../../test/s3/presign-simulation.js";

describe("S3 PutObjectCommand system metadata", () => {
  it("stores every system metadata header S3 keeps about an Object", async () => {
    // Given a Bucket.
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    // When an Object is written carrying all of them.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "report.csv",
        Body: "a,b,c",
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: 'attachment; filename="report.csv"',
        ContentEncoding: "br",
        ContentLanguage: "en-GB",
        ContentType: "text/csv",
        Expires: new Date("2026-10-21T07:28:00Z"),
      }),
    );

    // Then each one is remembered under the header name a read returns it as.
    const objectOut = await simS3.getObject(
      new GetObjectCommand({ Bucket: "bucket-a", Key: "report.csv" }),
    );
    assertObjectEquals(objectOut.Metadata, {
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": 'attachment; filename="report.csv"',
      "content-encoding": "br",
      "content-language": "en-GB",
      "content-type": "text/csv",
      expires: "Wed, 21 Oct 2026 07:28:00 GMT",
    });
  });

  it("records an expiry as the HTTP date a read hands back", async () => {
    // Given a Bucket.
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    // When an Object is written with the Date the SDK takes for an expiry.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "menu.json",
        Body: "{}",
        Expires: new Date("2027-01-02T03:04:05Z"),
      }),
    );

    // Then it is stored as the header value itself, not as an object a read
    // would have nothing to do with.
    const objectOut = await simS3.getObject(
      new GetObjectCommand({ Bucket: "bucket-a", Key: "menu.json" }),
    );
    assertIdentical(
      objectOut.Metadata?.["expires"],
      "Sat, 02 Jan 2027 03:04:05 GMT",
    );
  });

  it("leaves out a system metadata header the write did not carry", async () => {
    // Given a Bucket.
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    // When an Object is written with a content type alone.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "index.html",
        Body: "<h1>Hello</h1>",
        ContentType: "text/html",
      }),
    );

    // Then the content type is the only thing stored: the five headers it said
    // nothing about are absent, rather than undefined values a read would serve
    // as empty headers.
    const objectOut = await simS3.getObject(
      new GetObjectCommand({ Bucket: "bucket-a", Key: "index.html" }),
    );
    assertObjectEquals(objectOut.Metadata, { "content-type": "text/html" });
  });

  it("remembers nothing about an Object written without system metadata", async () => {
    // Given a Bucket.
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    // When an Object is written with a body alone.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "notes.txt",
        Body: "nothing to say",
      }),
    );

    // Then nothing is stored about it.
    const objectOut = await simS3.getObject(
      new GetObjectCommand({ Bucket: "bucket-a", Key: "notes.txt" }),
    );
    assertObjectEquals(objectOut.Metadata, {});
  });

  it("keeps user-defined metadata alongside system metadata", async () => {
    // Given a Bucket.
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    // When an Object is written with both.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "styles.css",
        Body: "body{}",
        Metadata: { author: "hg" },
        ContentEncoding: "gzip",
        ContentType: "text/css",
      }),
    );

    // Then the two sit side by side, since S3 keeps user metadata as well as
    // what it remembers about the Object itself.
    const objectOut = await simS3.getObject(
      new GetObjectCommand({ Bucket: "bucket-a", Key: "styles.css" }),
    );
    assertObjectEquals(objectOut.Metadata, {
      author: "hg",
      "content-encoding": "gzip",
      "content-type": "text/css",
    });
  });

  it("serves what a write said about an Object back over the REST endpoint", async () => {
    // Given an Object written through the SDK with a cache directive and an
    // encoding.
    const { simAws, client, http } = await presignSimulation();
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: presignBucketName,
        Key: "q3/report.js",
        Body: "compressed bytes",
        CacheControl: "public, max-age=60",
        ContentEncoding: "br",
        ContentType: "text/javascript",
      }),
    );

    // When it is read back over the endpoint that serves it.
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: presignBucketName, Key: "q3/report.js" }),
      { expiresIn: 900 },
    );
    const response = await http.fetch(url);

    // Then the write and the read agree: bytes stored as brotli are served with
    // the encoding a client needs to decode them.
    assertIdentical(response.status, 200);
    assertIdentical(
      response.headers.get("cache-control"),
      "public, max-age=60",
    );
    assertIdentical(response.headers.get("content-encoding"), "br");
    assertIdentical(response.headers.get("content-type"), "text/javascript");
  });
});

import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  presignBucketName,
  presignSimulation,
} from "../../../../../test/s3/presign-simulation.js";

describe("S3 PutObjectCommand system metadata", () => {
  it("hands back every system metadata header S3 keeps about an Object", async () => {
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

    // Then each one comes back in the field a read carries it in, which is
    // where a caller reading the Object looks for it.
    const objectOut = await simS3.getObject(
      new GetObjectCommand({ Bucket: "bucket-a", Key: "report.csv" }),
    );
    assertIdentical(
      objectOut.CacheControl,
      "public, max-age=31536000, immutable",
    );
    assertIdentical(
      objectOut.ContentDisposition,
      'attachment; filename="report.csv"',
    );
    assertIdentical(objectOut.ContentEncoding, "br");
    assertIdentical(objectOut.ContentLanguage, "en-GB");
    assertIdentical(objectOut.ContentType, "text/csv");
    assertIdentical(objectOut.ExpiresString, "Wed, 21 Oct 2026 07:28:00 GMT");
  });

  it("keeps user-defined metadata apart from what S3 remembers about the Object", async () => {
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

    // Then the user-defined metadata is the whole of `Metadata`. S3 carries
    // what it remembers about the Object in its own fields, so a caller
    // reading `Metadata` gets back what it put there and nothing else.
    const objectOut = await simS3.getObject(
      new GetObjectCommand({ Bucket: "bucket-a", Key: "styles.css" }),
    );
    assertObjectEquals(objectOut.Metadata, { author: "hg" });
    assertIdentical(objectOut.ContentEncoding, "gzip");
    assertIdentical(objectOut.ContentType, "text/css");
  });

  it("keeps a user metadata key that names a header S3 sets itself", async () => {
    // Given a Bucket.
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));

    // When an Object is written with a user metadata key called content-type,
    // and no content type of its own.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "notes.txt",
        Body: "nothing to say",
        Metadata: { "content-type": "whatever the caller meant" },
      }),
    );

    // Then the two stay apart. Real S3 carries user metadata under
    // `x-amz-meta-`, so a caller's key can name a header S3 sets itself
    // without becoming it.
    const objectOut = await simS3.getObject(
      new GetObjectCommand({ Bucket: "bucket-a", Key: "notes.txt" }),
    );
    assertObjectEquals(objectOut.Metadata, {
      "content-type": "whatever the caller meant",
    });
    assertIdentical(objectOut.ContentType, "binary/octet-stream");
  });

  it("reports the type S3 gives an Object that was written without one", async () => {
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

    // Then it has the type S3 falls back to rather than no type at all. S3
    // guesses nothing from the key, so a `.txt` file uploaded without a type
    // is served as bytes.
    const objectOut = await simS3.getObject(
      new GetObjectCommand({ Bucket: "bucket-a", Key: "notes.txt" }),
    );
    assertIdentical(objectOut.ContentType, "binary/octet-stream");
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

    // Then the five headers the write said nothing about are absent, rather
    // than empty values a caller would have to tell apart from real ones.
    const objectOut = await simS3.getObject(
      new GetObjectCommand({ Bucket: "bucket-a", Key: "index.html" }),
    );
    assertIdentical(objectOut.ContentType, "text/html");
    assertUndefined(objectOut.CacheControl);
    assertUndefined(objectOut.ContentDisposition);
    assertUndefined(objectOut.ContentEncoding);
    assertUndefined(objectOut.ContentLanguage);
    assertUndefined(objectOut.ExpiresString);
    assertObjectEquals(objectOut.Metadata, {});
  });

  it("describes an Object for a HEAD as a read describes it", async () => {
    // Given an Object written with system and user metadata.
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "menu.json",
        Body: "{}",
        CacheControl: "max-age=60",
        ContentType: "application/json",
        Metadata: { author: "hg" },
      }),
    );

    // When it is described rather than read.
    const headOut = await simS3.headObject(
      new HeadObjectCommand({ Bucket: "bucket-a", Key: "menu.json" }),
    );

    // Then a HEAD says what a read says, since it is the same answer without
    // the body.
    assertIdentical(headOut.CacheControl, "max-age=60");
    assertIdentical(headOut.ContentType, "application/json");
    assertObjectEquals(headOut.Metadata, { author: "hg" });
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

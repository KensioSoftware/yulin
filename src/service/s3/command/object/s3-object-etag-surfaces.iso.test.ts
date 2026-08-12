import { createHash } from "node:crypto";
import {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { BackgroundTasks } from "../../../../util/background/background.js";
import { SimS3 } from "../../sim-s3.js";

const quotedMd5 = (content: string): string =>
  `"${createHash("md5").update(content).digest("hex")}"`;

describe("S3 Object ETags", () => {
  it("reports the same ETag from every operation that mentions one", async () => {
    // Given an Object stored in a Bucket.
    const simS3 = new SimS3();
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "etag-bucket" }),
    );

    const put = await simS3.putObject(
      new PutObjectCommand({
        Bucket: "etag-bucket",
        Key: "report.csv",
        Body: "id,name\n1,one\n",
      }),
    );

    // When it is read, and listed both ways.
    const got = await simS3.getObject(
      new GetObjectCommand({ Bucket: "etag-bucket", Key: "report.csv" }),
    );
    const listed = await simS3.listObjects(
      new ListObjectsCommand({ Bucket: "etag-bucket" }),
    );
    const listedV2 = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "etag-bucket" }),
    );

    // Then all four agree, and agree with the MD5 a caller computes over the
    // same bytes, which is what makes an upload-only-what-changed sync work.
    const expected = quotedMd5("id,name\n1,one\n");
    assertIdentical(put.ETag, expected);
    assertIdentical(got.ETag, expected);
    assertIdentical(listed.Contents?.[0]?.ETag, expected);
    assertIdentical(listedV2.Contents?.[0]?.ETag, expected);
  });

  it("changes the ETag when the content changes, and not when it does not", async () => {
    // Given a key written, rewritten with the same content, then with different
    // content.
    const simS3 = new SimS3();
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "etag-change-bucket" }),
    );

    const put = async (body: string): Promise<string | undefined> => {
      const output = await simS3.putObject(
        new PutObjectCommand({
          Bucket: "etag-change-bucket",
          Key: "index.html",
          Body: body,
        }),
      );

      return output.ETag;
    };

    const first = await put("<h1>One</h1>");
    const again = await put("<h1>One</h1>");
    const changed = await put("<h1>Two</h1>");

    // Then only the content decides, which is the point of comparing hashes
    // rather than modification times: rewriting the same bytes leaves the ETag
    // alone, and rewriting different ones moves it to their digest.
    assertIdentical(first, quotedMd5("<h1>One</h1>"));
    assertIdentical(again, first);
    assertIdentical(changed, quotedMd5("<h1>Two</h1>"));
  });

  it("dates an Object by the simulation's clock rather than the host's", async () => {
    // Given a simulated S3 whose time is stopped at a known instant.
    const instant = new Date("2026-08-12T09:30:00.000Z");
    const simS3 = new SimS3({
      background: new BackgroundTasks({ clock: new SimFixedClock(instant) }),
    });

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "clock-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({ Bucket: "clock-bucket", Key: "a.txt", Body: "a" }),
    );

    // When the Object is read and listed.
    const got = await simS3.getObject(
      new GetObjectCommand({ Bucket: "clock-bucket", Key: "a.txt" }),
    );
    const listed = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "clock-bucket" }),
    );

    // Then it is dated at that instant, so a test can assert on it exactly.
    assertNonNullable(got.LastModified);
    assertIdentical(got.LastModified.toISOString(), instant.toISOString());
    assertIdentical(
      listed.Contents?.[0]?.LastModified?.toISOString(),
      instant.toISOString(),
    );
  });
});

import {
  CreateBucketCommand,
  ListObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimS3 } from "../sim-s3.js";

/**
 * The keys a listing hands back when it was asked to encode them.
 *
 * An Object key can hold characters an XML document cannot carry, and a
 * listing that wrote one straight into its response would answer with a
 * document no parser will read. `EncodingType` is what a caller asks for
 * instead, and everything the listing says about keys is then encoded
 * together: the keys, the prefix and delimiter it was asked for, and the
 * marker the next page starts at.
 */
describe("Encoding the keys a simulated S3 listing answers with", () => {
  async function bucketHolding(...keys: readonly string[]): Promise<SimS3> {
    const simS3 = new SimS3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "widgets" }));

    await Promise.all(
      keys.map(async (key) =>
        simS3.putObject(
          new PutObjectCommand({ Bucket: "widgets", Key: key, Body: key }),
        ),
      ),
    );

    return simS3;
  }

  it("encodes the keys a listing asked to have encoded", async () => {
    // Given a Bucket holding keys a browser upload produced, with a space and
    // an ampersand in them.
    const simS3 = await bucketHolding("img/holiday photo.png", "docs/a&b.txt");

    // When the Bucket is listed with URL encoding asked for.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "widgets", EncodingType: "url" }),
    );

    // Then each key comes back encoded the way S3 encodes one, and the
    // listing says which encoding a caller is reading.
    assertArrayLength(output.Contents, 2);
    assertIdentical(output.Contents[0].Key, "docs/a%26b.txt");
    assertIdentical(output.Contents[1].Key, "img/holiday+photo.png");
    assertIdentical(output.EncodingType, "url");
  });

  it("encodes the prefix, delimiter and folders alongside the keys", async () => {
    // Given a Bucket whose folder names hold a space.
    const simS3 = await bucketHolding(
      "site/holiday photos/one.png",
      "site/index.html",
    );

    // When it is walked one folder at a time with URL encoding asked for.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({
        Bucket: "widgets",
        Prefix: "site/",
        Delimiter: "/",
        EncodingType: "url",
      }),
    );

    // Then the rolled-up folder is encoded as a key is, and so are the prefix
    // and delimiter the listing echoes back.
    assertArrayLength(output.CommonPrefixes, 1);
    assertIdentical(output.CommonPrefixes[0].Prefix, "site/holiday+photos/");
    assertIdentical(output.Prefix, "site/");
    assertIdentical(output.Delimiter, "/");
  });

  it("encodes the marker the next page of a first-version listing starts at", async () => {
    // Given a Bucket holding more keys than one page can carry, where the
    // first page ends on a key with a space in it.
    const simS3 = await bucketHolding("a holiday.png", "b.png", "c.png");

    // When the first page is listed with URL encoding asked for.
    const output = await simS3.listObjects(
      new ListObjectsCommand({
        Bucket: "widgets",
        MaxKeys: 1,
        EncodingType: "url",
      }),
    );

    // Then the marker the next page resumes from is encoded, which is what a
    // caller decodes before sending it back.
    assertIdentical(output.NextMarker, "a+holiday.png");
    assertIdentical(output.EncodingType, "url");
  });

  it("reports the encoding of a listing that found nothing to encode", async () => {
    // Given a Bucket holding nothing under the prefix being listed.
    const simS3 = await bucketHolding("index.html");

    // When it is listed with URL encoding asked for.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({
        Bucket: "widgets",
        Prefix: "img/",
        EncodingType: "url",
      }),
    );

    // Then the listing still says which encoding it answered in, and holds
    // neither keys nor folders, as an empty listing does.
    assertUndefined(output.Contents);
    assertUndefined(output.CommonPrefixes);
    assertIdentical(output.EncodingType, "url");
  });

  it("leaves the keys of a listing that asked for no encoding alone", async () => {
    // Given a Bucket holding a key with a space in it.
    const simS3 = await bucketHolding("img/holiday photo.png");

    // When it is listed without asking for an encoding.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "widgets" }),
    );

    // Then the key is the one that was written, and nothing says otherwise,
    // so a caller that decodes nothing reads it correctly.
    assertArrayLength(output.Contents, 1);
    assertIdentical(output.Contents[0].Key, "img/holiday photo.png");
    assertUndefined(output.EncodingType);
  });

  it("refuses an encoding real S3 does not have", async () => {
    // Given a Bucket to list.
    const simS3 = await bucketHolding("index.html");

    // When a listing asks for an encoding by a name S3 has no encoding under.
    const listing = async (): Promise<unknown> =>
      await simS3.listObjectsV2(
        new ListObjectsV2Command({
          Bucket: "widgets",
          EncodingType: "base64" as "url",
        }),
      );

    // Then it is refused, rather than answered with keys the caller will
    // decode as though they had been encoded.
    await assertThrowsErrorAsync(listing, "Not an EncodingType real S3 has");
  });
});

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3 } from "../../sim-s3.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * A Bucket whose keys read as a folder tree, which is what a Delimiter is for.
 */
async function bucketOfFolders(...keys: readonly string[]): Promise<SimS3> {
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

function prefixesOf(output: {
  CommonPrefixes?: { Prefix?: string }[] | undefined;
}): string {
  return (output.CommonPrefixes ?? [])
    .map((commonPrefix) => commonPrefix.Prefix)
    .join(",");
}

describe("S3 ListObjectsV2Command with a Delimiter", () => {
  it("walks the top of a Bucket as a folder tree", async () => {
    // Given a Bucket holding keys at two levels.
    const simS3 = await bucketOfFolders(
      "img/a.png",
      "img/b.png",
      "index.html",
      "js/app.js",
    );

    // When the Bucket is listed under a slash.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "widgets", Delimiter: "/" }),
    );

    // Then each folder comes back once, the keys beneath them are left out of
    // Contents, and the request's own Delimiter is echoed back.
    assertIdentical(prefixesOf(output), "img/,js/");
    assertArrayLength(output.Contents, 1);
    assertIdentical(output.Contents[0].Key, "index.html");
    assertIdentical(output.Delimiter, "/");
    assertFalse(output.IsTruncated);
  });

  it("counts the folders and the keys together in KeyCount", async () => {
    // Given a Bucket holding two folders and one key.
    const simS3 = await bucketOfFolders("img/a.png", "index.html", "js/app.js");

    // When the Bucket is listed under a slash.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "widgets", Delimiter: "/" }),
    );

    // Then KeyCount counts a rolled-up folder as real S3 counts it, alongside
    // the key, rather than counting Contents alone.
    assertIdentical(output.KeyCount, 3);
  });

  it("leaves CommonPrefixes out when a listing rolls nothing up", async () => {
    // Given a Bucket with no folders in it.
    const simS3 = await bucketOfFolders("index.html", "robots.txt");

    // When the Bucket is listed under a slash.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "widgets", Delimiter: "/" }),
    );

    // Then CommonPrefixes is absent rather than empty, which is what a caller
    // written against AWS guards for.
    assertUndefined(output.CommonPrefixes);
    assertIdentical(output.KeyCount, 2);
  });

  it("lists one folder's contents under a Prefix", async () => {
    // Given a folder holding a key and a folder of its own.
    const simS3 = await bucketOfFolders(
      "img/icons/small.png",
      "img/logo.png",
      "index.html",
    );

    // When that folder is listed.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({
        Bucket: "widgets",
        Prefix: "img/",
        Delimiter: "/",
      }),
    );

    // Then the delimiter inside the Prefix is stepped over, and only what sits
    // directly in the folder comes back.
    assertIdentical(prefixesOf(output), "img/icons/");
    assertArrayLength(output.Contents, 1);
    assertIdentical(output.Contents[0].Key, "img/logo.png");
  });

  it("pages through a mixture of folders and keys in key order", async () => {
    // Given more entries at the top of the tree than one page holds.
    const simS3 = await bucketOfFolders(
      "img/a.png",
      "img/b.png",
      "index.html",
      "js/app.js",
    );

    // When the Bucket is listed a page at a time.
    const first = await simS3.listObjectsV2(
      new ListObjectsV2Command({
        Bucket: "widgets",
        Delimiter: "/",
        MaxKeys: 2,
      }),
    );

    assertTrue(first.IsTruncated);
    assertDefined(first.NextContinuationToken, "the first page's token");

    const second = await simS3.listObjectsV2(
      new ListObjectsV2Command({
        Bucket: "widgets",
        Delimiter: "/",
        MaxKeys: 2,
        ContinuationToken: first.NextContinuationToken,
      }),
    );

    // Then the pages carry on from each other without repeating the folder the
    // first one ended before, and without listing the keys under it.
    assertIdentical(prefixesOf(first), "img/");
    assertArrayLength(first.Contents, 1);
    assertIdentical(first.Contents[0].Key, "index.html");
    assertIdentical(prefixesOf(second), "js/");
    assertUndefined(second.Contents);
    assertFalse(second.IsTruncated);
  });

  it("rolls up under a delimiter that is not a slash", async () => {
    // Given keys separated by something else.
    const simS3 = await bucketOfFolders(
      "2024--q1.csv",
      "2024--q2.csv",
      "notes.md",
    );

    // When the Bucket is listed under that separator.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "widgets", Delimiter: "--" }),
    );

    // Then the common prefix runs through the whole of it.
    assertIdentical(prefixesOf(output), "2024--");
    assertArrayLength(output.Contents, 1);
    assertIdentical(output.Contents[0].Key, "notes.md");
  });
});

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertStringNotIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3InvalidArgument } from "../../error/sim-s3.error.js";
import { SimS3 } from "../../sim-s3.js";

async function bucketOfKeys(
  simS3: SimS3,
  bucketName: string,
  keys: readonly string[],
): Promise<void> {
  await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await Promise.all(
    keys.map(async (key) =>
      simS3.putObject(
        new PutObjectCommand({ Bucket: bucketName, Key: key, Body: key }),
      ),
    ),
  );
}

describe("S3 ListObjectsV2Command pagination", () => {
  it("walks a Bucket a page at a time with the token it hands back", async () => {
    // Given a Bucket holding more keys than the caller wants at once.
    const simS3 = new SimS3();
    await bucketOfKeys(simS3, "paged-bucket", ["a.txt", "b.txt", "c.txt"]);

    // When the first page of two is read.
    const first = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "paged-bucket", MaxKeys: 2 }),
    );

    // Then it is truncated and offers somewhere to carry on from.
    assertArrayLength(first.Contents, 2);
    assertIdentical(first.Contents[0].Key, "a.txt");
    assertIdentical(first.Contents[1].Key, "b.txt");
    assertTrue(first.IsTruncated);
    assertIdentical(first.KeyCount, 2);
    assertNonNullable(first.NextContinuationToken);

    // When the listing carries on from there.
    const second = await simS3.listObjectsV2(
      new ListObjectsV2Command({
        Bucket: "paged-bucket",
        MaxKeys: 2,
        ContinuationToken: first.NextContinuationToken,
      }),
    );

    // Then the rest arrives once, with nothing repeated and nothing skipped.
    assertArrayLength(second.Contents, 1);
    assertIdentical(second.Contents[0].Key, "c.txt");
    assertFalse(second.IsTruncated);
    assertUndefined(second.NextContinuationToken);
    assertIdentical(second.ContinuationToken, first.NextContinuationToken);
  });

  it("does not hand back the key a caller is meant to treat as opaque", async () => {
    // Given a truncated listing.
    const simS3 = new SimS3();
    await bucketOfKeys(simS3, "opaque-bucket", ["a.txt", "b.txt"]);

    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "opaque-bucket", MaxKeys: 1 }),
    );

    // Then the token is not the key itself, so a caller reading it as one has
    // to notice rather than getting away with it until it stops working.
    assertNonNullable(output.NextContinuationToken);
    assertStringNotIncludes(output.NextContinuationToken, "a.txt");
  });

  it("ignores StartAfter once a listing is under way", async () => {
    // Given a listing that has already returned its first page.
    const simS3 = new SimS3();
    await bucketOfKeys(simS3, "resumed-bucket", ["a.txt", "b.txt", "c.txt"]);

    const first = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "resumed-bucket", MaxKeys: 1 }),
    );

    // When the next page is asked for with a StartAfter that disagrees with the
    // continuation token.
    const second = await simS3.listObjectsV2(
      new ListObjectsV2Command({
        Bucket: "resumed-bucket",
        MaxKeys: 1,
        ContinuationToken: first.NextContinuationToken,
        StartAfter: "z.txt",
      }),
    );

    // Then the token decides, as it does in real S3, and StartAfter is only
    // reported back.
    assertArrayLength(second.Contents, 1);
    assertIdentical(second.Contents[0].Key, "b.txt");
    assertIdentical(second.StartAfter, "z.txt");
  });

  it("refuses a continuation token it did not issue", async () => {
    // Given a Bucket to list.
    const simS3 = new SimS3();
    await bucketOfKeys(simS3, "token-bucket", ["a.txt"]);

    // When a listing resumes from a token the caller made up.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listObjectsV2(
        new ListObjectsV2Command({
          Bucket: "token-bucket",
          ContinuationToken: "not-a-real-token",
        }),
      ),
    );

    // Then it is refused rather than answered from somewhere arbitrary, since a
    // plausible-looking page would hide the caller's bug.
    assertInstanceOf(error, SimS3InvalidArgument);
    assertStringIncludes(error.message, "not-a-real-token");
    assertIdentical(error.$metadata.httpStatusCode, 400);
  });

  it("refuses an empty continuation token", async () => {
    // Given a Bucket to list.
    const simS3 = new SimS3();
    await bucketOfKeys(simS3, "empty-token-bucket", ["a.txt"]);

    // When a listing resumes from a token that decodes to nothing.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.listObjectsV2(
        new ListObjectsV2Command({
          Bucket: "empty-token-bucket",
          ContinuationToken: "",
        }),
      ),
    );

    // Then it is refused, because no key was ever encoded as nothing.
    assertInstanceOf(error, SimS3InvalidArgument);
  });

  it("makes no progress for a caller asking for no keys, and loses none", async () => {
    // Given a listing under way.
    const simS3 = new SimS3();
    await bucketOfKeys(simS3, "zero-bucket", ["a.txt", "b.txt", "c.txt"]);

    const first = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "zero-bucket", MaxKeys: 1 }),
    );

    // When the next page is asked to hold nothing.
    const none = await simS3.listObjectsV2(
      new ListObjectsV2Command({
        Bucket: "zero-bucket",
        MaxKeys: 0,
        ContinuationToken: first.NextContinuationToken,
      }),
    );

    // Then it comes back empty and still truncated, offering the same place to
    // carry on from rather than one that would skip what was not shown.
    assertIdentical(none.KeyCount, 0);
    assertTrue(none.IsTruncated);
    assertIdentical(none.NextContinuationToken, first.NextContinuationToken);
  });

  it("has nowhere to resume when the very first page holds nothing", async () => {
    // Given a listing that asked for no keys before reading any.
    const simS3 = new SimS3();
    await bucketOfKeys(simS3, "zero-first-bucket", ["a.txt"]);

    // When the page is read.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "zero-first-bucket", MaxKeys: 0 }),
    );

    // Then there is more to come but no token yet, because nothing has been
    // listed to carry on after.
    assertTrue(output.IsTruncated);
    assertUndefined(output.NextContinuationToken);
  });

  it("caps a page at the thousand keys real S3 fixes it at", async () => {
    // Given a Bucket and a caller asking for far more than a page holds.
    const simS3 = new SimS3();
    await bucketOfKeys(simS3, "capped-bucket", ["a.txt"]);

    // When the listing asks for ten thousand keys.
    const output = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "capped-bucket", MaxKeys: 10_000 }),
    );

    // Then the response reports the page size S3 will actually use.
    assertIdentical(output.MaxKeys, 1000);
  });

  it("lets a test lower the page size to exercise a caller's pagination", async () => {
    // Given a simulated S3 told to hold one key per page, so a caller that
    // never names MaxKeys still has to continue a listing.
    const simS3 = new SimS3();
    simS3.configureMaxKeysPerPage(1);
    await bucketOfKeys(simS3, "small-page-bucket", ["a.txt", "b.txt"]);

    // When a listing that asks for no particular page size runs.
    const first = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "small-page-bucket" }),
    );

    // Then it is truncated after one key, without a thousand and one Objects
    // having to be stored to provoke it.
    assertIdentical(first.KeyCount, 1);
    assertIdentical(first.MaxKeys, 1);
    assertTrue(first.IsTruncated);

    const second = await simS3.listObjectsV2(
      new ListObjectsV2Command({
        Bucket: "small-page-bucket",
        ContinuationToken: first.NextContinuationToken,
      }),
    );

    assertIdentical(second.Contents?.[0]?.Key, "b.txt");
    assertFalse(second.IsTruncated);
  });

  it("applies the same page size to the first version of the operation", async () => {
    // Given a simulated S3 built with a page of one.
    const simS3 = new SimS3({ maxKeysPerPage: 1 });
    await bucketOfKeys(simS3, "v1-small-page-bucket", ["a.txt", "b.txt"]);

    // When the older ListObjects runs.
    const output = await simS3.listObjects({
      input: { Bucket: "v1-small-page-bucket" },
    });

    // Then it is bounded the same way, since one Bucket cannot page two ways.
    assertArrayLength(output.Contents, 1);
    assertTrue(output.IsTruncated);
    assertIdentical(output.NextMarker, "a.txt");
  });

  it("refuses a page size no listing could return anything from", () => {
    // Given a page size below one key.
    // When simulated S3 is told to use it.
    const error = assertThrowsError(() => {
      new SimS3({ maxKeysPerPage: 0 });
    });

    // Then it is refused, rather than leaving every listing empty and truncated
    // as though the Bucket were at fault.
    assertStringIncludes(error.message, "at least one");
  });

  it("refuses a page size that is not a whole number of keys", () => {
    const simS3 = new SimS3();

    const error = assertThrowsError(() => {
      simS3.configureMaxKeysPerPage(2.5);
    });

    assertStringIncludes(error.message, "whole number");
  });
});

import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3MalformedXml } from "../../error/sim-s3.error.js";

/**
 * A Bucket holding three Objects, which is enough to see a batch deletion
 * remove some of them and leave the rest.
 */
async function bucketOfThree(): Promise<ReturnType<SimAws["s3"]>> {
  const simS3 = new SimAws().s3();
  await simS3.createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

  await Promise.all(
    ["a.txt", "b.txt", "c.txt"].map(
      async (key) =>
        await simS3.putObject(
          new PutObjectCommand({ Bucket: "uploads", Key: key, Body: key }),
        ),
    ),
  );

  return simS3;
}

describe("S3 DeleteObjectsCommand", () => {
  it("removes every Object it names and reports each one", async () => {
    // Given a Bucket holding three Objects
    const simS3 = await bucketOfThree();

    // When two of them are deleted in one request
    const output = await simS3.deleteObjects(
      new DeleteObjectsCommand({
        Bucket: "uploads",
        Delete: { Objects: [{ Key: "a.txt" }, { Key: "b.txt" }] },
      }),
    );

    // Then both are reported deleted, and the third is still in the Bucket
    const deleted = output.Deleted ?? [];
    assertArrayLength(deleted, 2);
    assertIdentical(deleted[0].Key, "a.txt");
    assertIdentical(deleted[1].Key, "b.txt");
    assertUndefined(output.Errors);

    const listing = await simS3.listObjects(
      new ListObjectsCommand({ Bucket: "uploads" }),
    );
    const remaining = listing.Contents ?? [];
    assertArrayLength(remaining, 1);
    assertIdentical(remaining[0].Key, "c.txt");
  });

  it("reports a quiet request's failures alone", async () => {
    // Given a Bucket holding three Objects
    const simS3 = await bucketOfThree();

    // When a quiet request deletes one of them
    const output = await simS3.deleteObjects(
      new DeleteObjectsCommand({
        Bucket: "uploads",
        Delete: { Objects: [{ Key: "a.txt" }], Quiet: true },
      }),
    );

    // Then nothing is reported, because nothing failed
    assertUndefined(output.Deleted);
    assertUndefined(output.Errors);
  });

  it("succeeds for keys that are not there", async () => {
    // Given a Bucket with nothing in it
    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When keys that were never stored are deleted
    const output = await simS3.deleteObjects(
      new DeleteObjectsCommand({
        Bucket: "uploads",
        Delete: { Objects: [{ Key: "gone.txt" }] },
      }),
    );

    // Then they are reported deleted, as real S3 reports an idempotent removal
    assertArrayLength(output.Deleted ?? [], 1);
    assertUndefined(output.Errors);
  });

  it("reports a Bucket that does not exist", async () => {
    // Given no Bucket of that name
    const simS3 = new SimAws().s3();

    // When Objects are deleted from it
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteObjects(
        new DeleteObjectsCommand({
          Bucket: "absent",
          Delete: { Objects: [{ Key: "a.txt" }] },
        }),
      ),
    );

    // Then the whole request fails, rather than each key failing separately
    assertStringIncludes(error.message, "No S3 Bucket named absent");
  });

  it("refuses a request naming no Objects", async () => {
    // Given a Bucket and an empty deletion request
    const simS3 = await bucketOfThree();

    // When it is handled
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteObjects(
        new DeleteObjectsCommand({
          Bucket: "uploads",
          Delete: { Objects: [] },
        }),
      ),
    );

    // Then it is refused as malformed, as real S3 refuses it
    assertInstanceOf(error, SimS3MalformedXml);
    assertIdentical(error.$metadata.httpStatusCode, 400);
  });

  it("refuses a request naming more Objects than S3 accepts", async () => {
    // Given more than the thousand keys one request may carry
    const simS3 = await bucketOfThree();
    const objects = Array.from({ length: 1001 }, (_unused, index) => ({
      Key: `key-${String(index)}.txt`,
    }));

    // When they are all named in one request
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteObjects(
        new DeleteObjectsCommand({
          Bucket: "uploads",
          Delete: { Objects: objects },
        }),
      ),
    );

    // Then the request is refused before anything is deleted
    assertInstanceOf(error, SimS3MalformedXml);
    assertStringIncludes(error.message, "at most 1000");
  });

  it("rejects a request naming no Bucket", async () => {
    // Given a command with no Bucket
    const simS3 = new SimAws().s3();

    // When it is handled
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteObjects(
        new DeleteObjectsCommand({
          Bucket: undefined,
          Delete: { Objects: [{ Key: "a.txt" }] },
        }),
      ),
    );

    // Then the malformed request is reported
    assertStringIncludes(error.message, "DeleteObjectsCommand.input.Bucket");
  });

  it("rejects a request with no deletion document", async () => {
    // Given a command with no Delete
    const simS3 = new SimAws().s3();

    // When it is handled
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteObjects(
        new DeleteObjectsCommand({ Bucket: "uploads", Delete: undefined }),
      ),
    );

    // Then the malformed request is reported
    assertStringIncludes(error.message, "DeleteObjectsCommand.input.Delete");
  });

  it("rejects an entry naming no key", async () => {
    // Given a deletion entry with no Key
    const simS3 = new SimAws().s3();

    // When it is handled
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteObjects(
        new DeleteObjectsCommand({
          Bucket: "uploads",
          Delete: { Objects: [{ Key: undefined }] },
        }),
      ),
    );

    // Then the malformed entry is reported
    assertStringIncludes(error.message, "Delete.Objects Key");
  });
});

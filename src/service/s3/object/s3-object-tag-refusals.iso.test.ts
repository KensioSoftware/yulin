import {
  CreateBucketCommand,
  GetObjectTaggingCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimS3InvalidTag, SimS3NoSuchKey } from "../error/sim-s3.error.js";
import { reportBucket } from "../../../../test/s3/object-tagging-fixture.js";

/**
 * The tag sets simulated S3 refuses to hold.
 *
 * Real S3 checks the whole set before it writes any of it, so an Object never
 * ends up carrying part of a set S3 rejected. These name the case each refusal
 * covers and then read the Object back to show nothing landed on it.
 */
describe("Refusing a simulated S3 Object tag set", () => {
  it("refuses a tag set of more than ten tags", async () => {
    // Given a stored Object.
    const { simS3, bucketName, key } = await reportBucket();

    // When eleven tags are put on it.
    const tagging = await assertThrowsErrorAsync(async () => {
      await simS3.putObjectTagging(
        new PutObjectTaggingCommand({
          Bucket: bucketName,
          Key: key,
          Tagging: {
            TagSet: Array.from({ length: 11 }, (_, index) => ({
              Key: `tag-${index}`,
              Value: "set",
            })),
          },
        }),
      );
    });

    // Then the whole set is refused, and none of it reached the Object.
    assertInstanceOf(tagging, SimS3InvalidTag);
    const read = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({ Bucket: bucketName, Key: key }),
    );
    assertArrayEmpty(read.TagSet);
  });

  it("refuses two tags under the one key", async () => {
    // Given a stored Object.
    const { simS3, bucketName, key } = await reportBucket();

    // When a tag set states one key twice.
    const tagging = await assertThrowsErrorAsync(async () => {
      await simS3.putObjectTagging(
        new PutObjectTaggingCommand({
          Bucket: bucketName,
          Key: key,
          Tagging: {
            TagSet: [
              { Key: "department", Value: "finance" },
              { Key: "department", Value: "legal" },
            ],
          },
        }),
      );
    });

    // Then it is refused rather than one of the two values winning.
    assertInstanceOf(tagging, SimS3InvalidTag);
  });

  it("refuses a tag naming no key", async () => {
    // Given a stored Object.
    const { simS3, bucketName, key } = await reportBucket();

    // When a tag arrives with a value and no key. The SDK's own type refuses
    // to build that Command, so the request is stated directly, which is what
    // an HTTP caller sending the document itself can do.
    const tagging = await assertThrowsErrorAsync(async () => {
      await simS3.putObjectTagging({
        input: {
          Bucket: bucketName,
          Key: key,
          Tagging: { TagSet: [{ Value: "finance" }] },
        },
      });
    });

    // Then it is refused rather than stored under an empty key.
    assertInstanceOf(tagging, SimS3InvalidTag);
  });

  it("refuses a write whose Tagging query string holds too many tags", async () => {
    // Given a Bucket.
    const simAws = new SimAws();
    const bucketName = `reports-${faker.string.uuid()}`;
    const simS3 = simAws.s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    // When a write names eleven tags.
    const writing = await assertThrowsErrorAsync(async () => {
      await simS3.putObject(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: "quarterly.csv",
          Body: "period,total",
          Tagging: Array.from(
            { length: 11 },
            (_, index) => `tag-${index}=set`,
          ).join("&"),
        }),
      );
    });

    // Then the write is refused, as real S3 refuses it.
    assertInstanceOf(writing, SimS3InvalidTag);
  });

  it("refuses to tag a key holding nothing", async () => {
    // Given a Bucket with nothing under the key.
    const simAws = new SimAws();
    const bucketName = `reports-${faker.string.uuid()}`;
    const simS3 = simAws.s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    // When that key is tagged.
    const tagging = await assertThrowsErrorAsync(async () => {
      await simS3.putObjectTagging(
        new PutObjectTaggingCommand({
          Bucket: bucketName,
          Key: "missing.csv",
          Tagging: { TagSet: [{ Key: "department", Value: "finance" }] },
        }),
      );
    });

    // Then S3 reports there is no such key.
    assertInstanceOf(tagging, SimS3NoSuchKey);
  });
});

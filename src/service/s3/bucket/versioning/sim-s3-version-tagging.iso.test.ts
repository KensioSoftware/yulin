import {
  CreateBucketCommand,
  DeleteObjectTaggingCommand,
  GetObjectTaggingCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3NoSuchVersion } from "../../error/sim-s3.error.js";
import { tagsByKey } from "../../../../../test/s3/object-tagging-fixture.js";
import type { SimS3 } from "../../sim-s3.js";

/**
 * Two versions of one report, each written with the tags given.
 */
async function versionedReports(
  first: string,
  second: string,
): Promise<{
  readonly simS3: SimS3;
  readonly bucketName: string;
  readonly key: string;
  readonly firstVersionId: string;
}> {
  const bucketName = `reports-${faker.string.uuid()}`;
  const key = "quarterly.csv";
  const simS3 = new SimAws().s3();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await simS3.putBucketVersioning(
    new PutBucketVersioningCommand({
      Bucket: bucketName,
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );

  const written = await simS3.putObject(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: "period,total",
      Tagging: first,
    }),
  );
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: "period,total,tax",
      Tagging: second,
    }),
  );

  assertDefined(written.VersionId, "the first version id");

  return { simS3, bucketName, key, firstVersionId: written.VersionId };
}

/**
 * The tags on one version of a simulated S3 Object.
 *
 * A tag set belongs to the version it was put on, so writing a new version
 * leaves the old one's tags where they were, and a tagging request naming a
 * version reaches that one alone.
 */
describe("Tagging one version of a simulated S3 Object", () => {
  it("leaves an older version carrying the tags it was written with", async () => {
    // Given two versions of one key, written with different tags.
    const { simS3, bucketName, key, firstVersionId } = await versionedReports(
      "department=finance",
      "department=legal",
    );

    // When the older version's tags are read by its own id.
    const read = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({
        Bucket: bucketName,
        Key: key,
        VersionId: firstVersionId,
      }),
    );

    // Then they are the ones that version was written with.
    assertIdentical(tagsByKey(read.TagSet)["department"], "finance");
    assertIdentical(read.VersionId, firstVersionId);
  });

  it("tags the version a request names and leaves the current one alone", async () => {
    // Given two versions of one key, both tagged the same way.
    const { simS3, bucketName, key, firstVersionId } = await versionedReports(
      "department=finance",
      "department=finance",
    );

    // When the older version alone is retagged.
    await simS3.putObjectTagging(
      new PutObjectTaggingCommand({
        Bucket: bucketName,
        Key: key,
        VersionId: firstVersionId,
        Tagging: { TagSet: [{ Key: "department", Value: "archive" }] },
      }),
    );

    // Then the current version still carries what it was written with.
    const current = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({ Bucket: bucketName, Key: key }),
    );

    assertIdentical(tagsByKey(current.TagSet)["department"], "finance");
  });

  it("untags the version a request names and leaves the current one alone", async () => {
    // Given two versions of one key, both tagged the same way.
    const { simS3, bucketName, key, firstVersionId } = await versionedReports(
      "department=finance",
      "department=finance",
    );

    // When the older version's tags are deleted.
    await simS3.deleteObjectTagging(
      new DeleteObjectTaggingCommand({
        Bucket: bucketName,
        Key: key,
        VersionId: firstVersionId,
      }),
    );

    // Then the current version is still tagged.
    const current = await simS3.getObjectTagging(
      new GetObjectTaggingCommand({ Bucket: bucketName, Key: key }),
    );

    assertIdentical(tagsByKey(current.TagSet)["department"], "finance");
  });

  it("refuses a version id the Bucket never issued", async () => {
    // Given a versioned key.
    const { simS3, bucketName, key } = await versionedReports(
      "department=finance",
      "department=legal",
    );

    // When a tagging read names an id no version of it was given.
    const reading = await assertThrowsErrorAsync(async () => {
      await simS3.getObjectTagging(
        new GetObjectTaggingCommand({
          Bucket: bucketName,
          Key: key,
          VersionId: faker.string.uuid(),
        }),
      );
    });

    // Then S3 reports there is no such version.
    assertInstanceOf(reading, SimS3NoSuchVersion);
  });
});

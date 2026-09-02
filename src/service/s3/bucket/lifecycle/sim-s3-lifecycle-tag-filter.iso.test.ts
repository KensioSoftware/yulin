import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  type LifecycleRule,
} from "@aws-sdk/client-s3";
import { assertArrayEquals } from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";

const startedAt = new Date("2026-09-02T09:00:00.000Z");

/**
 * A Bucket holding one temporary report and one permanent one, with the rules
 * given.
 *
 * Only the first is tagged, so a rule filtering on the tag has one Object to
 * reach and one to leave alone.
 */
async function reportingSimulation(
  bucketName: string,
  rules: readonly LifecycleRule[],
): Promise<SimAws> {
  const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
  const simS3 = simAws.region("eu-west-2").s3();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await simS3.putBucketLifecycleConfiguration(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucketName,
      LifecycleConfiguration: { Rules: [...rules] },
    }),
  );
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: "reports/draft.csv",
      Body: "period,total",
      Tagging: "lifecycle=temporary",
    }),
  );
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: "reports/final.csv",
      Body: "period,total",
    }),
  );

  return simAws;
}

/**
 * The keys a listing of the whole Bucket answers with.
 */
async function storedKeys(
  simAws: SimAws,
  bucketName: string,
): Promise<readonly string[]> {
  const listing = await simAws
    .region("eu-west-2")
    .s3()
    .listObjectsV2(new ListObjectsV2Command({ Bucket: bucketName }));

  return (listing.Contents ?? []).map((entry) => entry.Key ?? "");
}

/**
 * Expiring simulated S3 Objects by the tags they carry.
 *
 * A rule states a tag either on its own or inside an `And` alongside a prefix,
 * and both scope the rule to the Objects carrying it. Expiry is applied when
 * the Bucket is read, so moving the clock is all these do to get there.
 */
describe("Simulated S3 lifecycle tag filters", () => {
  it("expires the Objects a bare tag filter selects", async () => {
    // Given a Bucket expiring anything tagged as temporary after a week.
    const bucketName = `reports-${faker.string.uuid()}`;
    const simAws = await reportingSimulation(bucketName, [
      {
        ID: "expire-temporary",
        Status: "Enabled",
        Filter: { Tag: { Key: "lifecycle", Value: "temporary" } },
        Expiration: { Days: 7 },
      },
    ]);

    // When the clock passes the expiry.
    await simAws.clock().advanceBy({ days: 8 });

    // Then the tagged Object has gone and the untagged one is still there.
    assertArrayEquals(await storedKeys(simAws, bucketName), [
      "reports/final.csv",
    ]);
  });

  it("leaves an Object carrying another value under the same key", async () => {
    // Given a Bucket expiring Objects tagged as permanent, which none is.
    const bucketName = `reports-${faker.string.uuid()}`;
    const simAws = await reportingSimulation(bucketName, [
      {
        ID: "expire-permanent",
        Status: "Enabled",
        Filter: { Tag: { Key: "lifecycle", Value: "permanent" } },
        Expiration: { Days: 7 },
      },
    ]);

    // When the clock passes the expiry.
    await simAws.clock().advanceBy({ days: 8 });

    // Then both Objects are still there, because neither carries that value.
    assertArrayEquals(await storedKeys(simAws, bucketName), [
      "reports/draft.csv",
      "reports/final.csv",
    ]);
  });

  it("expires the Objects an And operator's tags select", async () => {
    // Given a Bucket expiring tagged reports under one prefix.
    const bucketName = `reports-${faker.string.uuid()}`;
    const simAws = await reportingSimulation(bucketName, [
      {
        ID: "expire-temporary-reports",
        Status: "Enabled",
        Filter: {
          And: {
            Prefix: "reports/",
            Tags: [{ Key: "lifecycle", Value: "temporary" }],
          },
        },
        Expiration: { Days: 7 },
      },
    ]);

    // When the clock passes the expiry.
    await simAws.clock().advanceBy({ days: 8 });

    // Then only the tagged report under that prefix has gone.
    assertArrayEquals(await storedKeys(simAws, bucketName), [
      "reports/final.csv",
    ]);
  });

  it("leaves an Object a tagging request has since untagged", async () => {
    // Given a Bucket expiring anything tagged as temporary after a week.
    const bucketName = `reports-${faker.string.uuid()}`;
    const simAws = await reportingSimulation(bucketName, [
      {
        ID: "expire-temporary",
        Status: "Enabled",
        Filter: { Tag: { Key: "lifecycle", Value: "temporary" } },
        Expiration: { Days: 7 },
      },
    ]);

    // When the tagged Object is retagged out of the rule's reach, and the
    // clock passes the expiry.
    await simAws
      .region("eu-west-2")
      .s3()
      .putObjectTagging(
        new PutObjectTaggingCommand({
          Bucket: bucketName,
          Key: "reports/draft.csv",
          Tagging: { TagSet: [{ Key: "lifecycle", Value: "permanent" }] },
        }),
      );
    await simAws.clock().advanceBy({ days: 8 });

    // Then the rule no longer selects it and both Objects are there.
    assertArrayEquals(await storedKeys(simAws, bucketName), [
      "reports/draft.csv",
      "reports/final.csv",
    ]);
  });
});

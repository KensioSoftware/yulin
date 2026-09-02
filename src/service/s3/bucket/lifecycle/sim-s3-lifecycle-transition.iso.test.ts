import {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  type LifecycleRule,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3InvalidStorageClass } from "../../error/sim-s3.error.js";

const startedAt = new Date("2026-08-24T09:00:00.000Z");

const coolThenFreeze: LifecycleRule = {
  ID: "cool-then-freeze",
  Status: "Enabled",
  Filter: { Prefix: "raw/" },
  Transitions: [
    { Days: 30, StorageClass: "STANDARD_IA" },
    { Days: 90, StorageClass: "GLACIER" },
  ],
};

/**
 * A Bucket holding one raw log and one report, configured with the given
 * rules.
 */
async function loggingSimulation(
  rules: readonly LifecycleRule[],
): Promise<SimAws> {
  const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
  const simS3 = simAws.region("eu-west-2").s3();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: "logs" }));
  await simS3.putBucketLifecycleConfiguration(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: "logs",
      LifecycleConfiguration: { Rules: [...rules] },
    }),
  );
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "logs",
      Key: "raw/2026-08-24.gz",
      Body: "one raw log line",
    }),
  );
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "logs",
      Key: "reports/august.csv",
      Body: "a,b",
    }),
  );

  return simAws;
}

/**
 * The class a listing reports for one key.
 */
async function listedClass(
  simAws: SimAws,
  key: string,
): Promise<string | undefined> {
  const listing = await simAws
    .region("eu-west-2")
    .s3()
    .listObjectsV2(new ListObjectsV2Command({ Bucket: "logs" }));

  return (listing.Contents ?? []).find((entry) => entry.Key === key)
    ?.StorageClass;
}

/**
 * Transitioning simulated S3 Objects between storage classes.
 *
 * A transition is applied when the Bucket is read, as an expiry is, so moving
 * the clock is all a test does to reach one.
 */
describe("Simulated S3 lifecycle transitions", () => {
  it("leaves an Object the clock has not carried to a transition", async () => {
    // Given a Bucket cooling its raw logs after thirty days.
    const simAws = await loggingSimulation([coolThenFreeze]);

    // When simulated time moves on by less than that.
    await simAws.clock().advanceBy({ days: 29 });

    // Then the log is where it was written.
    assertIdentical(await listedClass(simAws, "raw/2026-08-24.gz"), "STANDARD");
  });

  it("moves an Object the moment the clock reaches a transition", async () => {
    // Given a Bucket cooling its raw logs after thirty days.
    const simAws = await loggingSimulation([coolThenFreeze]);

    // When simulated time reaches the thirty days exactly.
    await simAws.clock().advanceBy({ days: 30 });

    // Then the log has moved, and the report the rule does not select stays
    // where it is.
    assertIdentical(
      await listedClass(simAws, "raw/2026-08-24.gz"),
      "STANDARD_IA",
    );
    assertIdentical(
      await listedClass(simAws, "reports/august.csv"),
      "STANDARD",
    );
  });

  it("walks an Object down the classes a rule lists", async () => {
    // Given a Bucket cooling its raw logs and then freezing them.
    const simAws = await loggingSimulation([coolThenFreeze]);

    // When simulated time passes both boundaries.
    await simAws.clock().advanceBy({ days: 90 });

    // Then the Object is in the class of the last transition it reached.
    const read = await simAws
      .region("eu-west-2")
      .s3()
      .getObject(
        new GetObjectCommand({ Bucket: "logs", Key: "raw/2026-08-24.gz" }),
      );

    assertIdentical(read.StorageClass, "GLACIER");
  });

  it("expires a transitioned Object at its own age", async () => {
    // Given a Bucket that both cools and expires the same raw logs.
    const simAws = await loggingSimulation([
      coolThenFreeze,
      {
        ID: "expire-raw-logs",
        Status: "Enabled",
        Filter: { Prefix: "raw/" },
        Expiration: { Days: 365 },
      },
    ]);

    // When simulated time reaches the expiry.
    await simAws.clock().advanceBy({ days: 365 });

    // Then the transitions did nothing to hold the Object back from it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .region("eu-west-2")
        .s3()
        .getObject(
          new GetObjectCommand({ Bucket: "logs", Key: "raw/2026-08-24.gz" }),
        ),
    );

    assertStringIncludes(error.message, "raw/2026-08-24.gz");
  });

  it("transitions a noncurrent version once it has been displaced", async () => {
    // Given a versioned Bucket whose noncurrent versions cool after a week.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "logs" }));
    await simS3.putBucketVersioning(
      new PutBucketVersioningCommand({
        Bucket: "logs",
        VersioningConfiguration: { Status: "Enabled" },
      }),
    );
    await simS3.putBucketLifecycleConfiguration(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: "logs",
        LifecycleConfiguration: {
          Rules: [
            {
              ID: "cool-old-versions",
              Status: "Enabled",
              Filter: { Prefix: "raw/" },
              NoncurrentVersionTransitions: [
                { NoncurrentDays: 7, StorageClass: "GLACIER_IR" },
              ],
            },
          ],
        },
      }),
    );

    // When a second write displaces the first version and a week passes.
    await simS3.putObject(
      new PutObjectCommand({ Bucket: "logs", Key: "raw/log.gz", Body: "one" }),
    );
    await simS3.putObject(
      new PutObjectCommand({ Bucket: "logs", Key: "raw/log.gz", Body: "two" }),
    );
    await simAws.clock().advanceBy({ days: 7 });

    // Then the displaced version has moved and the current one has not.
    const versions = await simS3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: "logs" }),
    );
    const classes = (versions.Versions ?? []).map(
      (version) =>
        `${version.IsLatest ? "current" : "noncurrent"}:${version.StorageClass}`,
    );

    assertIdentical(
      classes.toSorted((one, other) => one.localeCompare(other)).join(","),
      "current:STANDARD,noncurrent:GLACIER_IR",
    );
  });

  it("refuses a rule transitioning to a class S3 has no such class for", async () => {
    // Given a Bucket.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    const simS3 = simAws.region("eu-west-2").s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "logs" }));

    // When a rule names something that is not a storage class.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketLifecycleConfiguration(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: "logs",
          LifecycleConfiguration: {
            Rules: [
              {
                ID: "freeze",
                Status: "Enabled",
                Filter: { Prefix: "raw/" },
                Transitions: [
                  { Days: 30, StorageClass: "PERMAFROST" as "GLACIER" },
                ],
              },
            ],
          },
        }),
      ),
    );

    // Then the configuration is refused where it is stored, before it is
    // applied to anything.
    assertInstanceOf(error, SimS3InvalidStorageClass);
    assertStringIncludes(error.message, "freeze");
  });
});

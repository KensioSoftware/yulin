import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  type LifecycleRule,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3NoSuchKey, SimS3NotFound } from "../../error/sim-s3.error.js";

const startedAt = new Date("2026-08-24T09:00:00.000Z");

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
 * The keys a listing of the whole Bucket answers with.
 */
async function storedKeys(simAws: SimAws): Promise<readonly string[]> {
  const listing = await simAws
    .region("eu-west-2")
    .s3()
    .listObjectsV2(new ListObjectsV2Command({ Bucket: "logs" }));

  return (listing.Contents ?? []).map((entry) => entry.Key ?? "");
}

const expireRawLogs: LifecycleRule = {
  ID: "expire-raw-logs",
  Status: "Enabled",
  Filter: { Prefix: "raw/" },
  Expiration: { Days: 365 },
};

/**
 * Expiring simulated S3 Objects against a Bucket's lifecycle rules.
 *
 * Expiry is applied when the Bucket is read, so what a read finds is what the
 * rules leave at that instant. Moving the clock is all a test does to get
 * there.
 */
describe("Simulated S3 lifecycle expiry", () => {
  it("keeps an Object the clock has not carried to the expiry", async () => {
    // Given a Bucket expiring raw logs after a year.
    const simAws = await loggingSimulation([expireRawLogs]);

    // When simulated time moves on by less than that.
    await simAws.clock().advanceBy({ days: 364 });

    // Then both Objects are still there.
    const keys = await storedKeys(simAws);
    assertIdentical(keys.join(","), "raw/2026-08-24.gz,reports/august.csv");
  });

  it("drops an Object the moment the clock reaches the expiry", async () => {
    // Given a Bucket expiring raw logs after a year.
    const simAws = await loggingSimulation([expireRawLogs]);

    // When simulated time reaches the year exactly.
    await simAws.clock().advanceBy({ days: 365 });

    // Then the log has already gone, because an Object expires on the
    // boundary rather than some time after it. The report the rule does not
    // select is left where it is.
    const keys = await storedKeys(simAws);
    assertIdentical(keys.join(","), "reports/august.csv");
  });

  it("reports an expired Object as absent to a read and a head", async () => {
    // Given a Bucket whose raw log the clock has carried past its expiry.
    const simAws = await loggingSimulation([expireRawLogs]);
    await simAws.clock().advanceBy({ days: 366 });

    // When the Object is read and asked about.
    const read = await assertThrowsErrorAsync(async () =>
      simAws
        .region("eu-west-2")
        .s3()
        .getObject(
          new GetObjectCommand({ Bucket: "logs", Key: "raw/2026-08-24.gz" }),
        ),
    );
    const head = await assertThrowsErrorAsync(async () =>
      simAws
        .region("eu-west-2")
        .s3()
        .headObject(
          new HeadObjectCommand({ Bucket: "logs", Key: "raw/2026-08-24.gz" }),
        ),
    );

    // Then both answer as they would for a key nothing was ever written to.
    assertInstanceOf(read, SimS3NoSuchKey);
    assertInstanceOf(head, SimS3NotFound);
  });

  it("expires an Object once the clock passes an Expiration Date", async () => {
    // Given a Bucket expiring raw logs at the turn of the year.
    const simAws = await loggingSimulation([
      {
        ID: "expire-by-date",
        Status: "Enabled",
        Filter: { Prefix: "raw/" },
        Expiration: { Date: new Date("2027-01-01T00:00:00.000Z") },
      },
    ]);

    // When simulated time reaches the second before, and then the instant
    // itself.
    await simAws.clock().setTo(new Date("2026-12-31T23:59:59.000Z"));
    const beforeTheDate = await storedKeys(simAws);
    await simAws.clock().setTo(new Date("2027-01-01T00:00:00.000Z"));

    // Then the instant in the rule is what separates the two readings.
    const afterTheDate = await storedKeys(simAws);
    assertArrayLength(beforeTheDate, 2);
    assertIdentical(afterTheDate.join(","), "reports/august.csv");
  });

  it("leaves every Object where it is for a Disabled rule", async () => {
    // Given a Bucket carrying the same rule, switched off.
    const simAws = await loggingSimulation([
      { ...expireRawLogs, Status: "Disabled" },
    ]);

    // When simulated time moves well past the expiry the rule states.
    await simAws.clock().advanceBy({ days: 800 });

    // Then nothing has gone.
    assertArrayLength(await storedKeys(simAws), 2);
  });

  it("selects by the older top-level Prefix as well as by a Filter", async () => {
    // Given a Bucket whose rule states its scope the way the first version of
    // the API did. The SDK marks that field deprecated, and real S3 still
    // stores a rule using it.
    const simAws = await loggingSimulation([
      {
        ID: "expire-raw-logs",
        Status: "Enabled",
        // oxlint-disable-next-line typescript/no-deprecated
        Prefix: "raw/",
        Expiration: { Days: 365 },
      },
    ]);

    // When simulated time moves past the expiry.
    await simAws.clock().advanceBy({ days: 366 });

    // Then the prefix selected the same Object a Filter would have.
    const keys = await storedKeys(simAws);
    assertIdentical(keys.join(","), "reports/august.csv");
  });

  it("selects by the object size bounds a filter states", async () => {
    // Given a Bucket expiring whatever is larger than four bytes, which is
    // the raw log and not the report.
    const simAws = await loggingSimulation([
      {
        ID: "expire-large-objects",
        Status: "Enabled",
        Filter: { ObjectSizeGreaterThan: 4 },
        Expiration: { Days: 1 },
      },
    ]);

    // When simulated time moves past the expiry.
    await simAws.clock().advanceBy({ days: 2 });

    // Then only the Object inside the bound has gone.
    const keys = await storedKeys(simAws);
    assertIdentical(keys.join(","), "reports/august.csv");
  });

  it("expires nothing for a rule that only transitions", async () => {
    // Given a Bucket whose only rule moves Objects between storage classes.
    const simAws = await loggingSimulation([
      {
        ID: "archive-raw-logs",
        Status: "Enabled",
        Filter: { Prefix: "raw/" },
        Transitions: [{ Days: 30, StorageClass: "GLACIER" }],
      },
    ]);

    // When simulated time moves well past the transition.
    await simAws.clock().advanceBy({ days: 800 });

    // Then both Objects are still there. Storage classes are left out of the
    // simulator, and a transition removes nothing.
    assertArrayLength(await storedKeys(simAws), 2);
  });

  it("selects nothing for a rule filtered by an Object tag", async () => {
    // Given a Bucket expiring raw logs carrying a tag.
    const simAws = await loggingSimulation([
      {
        ID: "expire-tagged-logs",
        Status: "Enabled",
        Filter: {
          And: { Prefix: "raw/", Tags: [{ Key: "class", Value: "raw" }] },
        },
        Expiration: { Days: 365 },
      },
    ]);

    // When simulated time moves past the expiry.
    await simAws.clock().advanceBy({ days: 366 });

    // Then both Objects are still there. Simulated S3 holds no Object tags,
    // so a tag is a condition nothing meets.
    assertArrayLength(await storedKeys(simAws), 2);
  });

  it("selects by a conjunction of a prefix and a size bound", async () => {
    // Given a Bucket expiring raw logs larger than four bytes.
    const simAws = await loggingSimulation([
      {
        ID: "expire-large-raw-logs",
        Status: "Enabled",
        Filter: { And: { Prefix: "raw/", ObjectSizeGreaterThan: 4 } },
        Expiration: { Days: 365 },
      },
    ]);

    // When simulated time moves past the expiry.
    await simAws.clock().advanceBy({ days: 366 });

    // Then the Object meeting both halves of the conjunction has gone.
    const keys = await storedKeys(simAws);
    assertIdentical(keys.join(","), "reports/august.csv");
  });

  it("expires every Object for a rule stating no scope at all", async () => {
    // Given a Bucket whose rule states neither a Prefix nor a Filter.
    const simAws = await loggingSimulation([
      { ID: "expire-everything", Status: "Enabled", Expiration: { Days: 365 } },
    ]);

    // When simulated time moves past the expiry.
    await simAws.clock().advanceBy({ days: 366 });

    // Then the whole Bucket has gone, which is the scope such a rule covers.
    assertArrayLength(await storedKeys(simAws), 0);
  });

  it("selects by both object size bounds at once", async () => {
    // Given a Bucket expiring whatever is between four and a hundred bytes.
    const simAws = await loggingSimulation([
      {
        ID: "expire-middling-objects",
        Status: "Enabled",
        Filter: { And: { ObjectSizeGreaterThan: 4, ObjectSizeLessThan: 100 } },
        Expiration: { Days: 365 },
      },
    ]);

    // When simulated time moves past the expiry.
    await simAws.clock().advanceBy({ days: 366 });

    // Then the three byte report is under the lower bound and stays.
    const keys = await storedKeys(simAws);
    assertIdentical(keys.join(","), "reports/august.csv");
  });

  it("selects nothing for a rule filtered by a single tag", async () => {
    // Given a Bucket expiring whatever carries a tag.
    const simAws = await loggingSimulation([
      {
        ID: "expire-tagged",
        Status: "Enabled",
        Filter: { Tag: { Key: "class", Value: "raw" } },
        Expiration: { Days: 365 },
      },
    ]);

    // When simulated time moves past the expiry.
    await simAws.clock().advanceBy({ days: 366 });

    // Then both Objects are still there, as for a tag inside an And.
    assertArrayLength(await storedKeys(simAws), 2);
  });

  it("expires nothing for an Expiration stating no boundary", async () => {
    // Given a Bucket whose rule expires only a delete marker.
    const simAws = await loggingSimulation([
      {
        ID: "expire-delete-markers",
        Status: "Enabled",
        Filter: { Prefix: "raw/" },
        Expiration: { ExpiredObjectDeleteMarker: true },
      },
    ]);

    // When simulated time moves well past anything.
    await simAws.clock().advanceBy({ days: 800 });

    // Then both Objects are still there. Object versions are left out, so
    // there is no delete marker for the rule to reach.
    assertArrayLength(await storedKeys(simAws), 2);
  });

  it("leaves an expired Object gone once the clock moves back", async () => {
    // Given a Bucket whose raw log expired while the clock was ahead.
    const simAws = await loggingSimulation([expireRawLogs]);
    await simAws.clock().advanceBy({ days: 366 });
    await storedKeys(simAws);

    // When simulated time moves back to before the Object was written.
    await simAws.clock().setTo(startedAt);

    // Then the Object stays gone. Expiry removed it, and moving the clock
    // back moves the clock rather than restoring what a rule deleted.
    const keys = await storedKeys(simAws);
    assertIdentical(keys.join(","), "reports/august.csv");
  });
});

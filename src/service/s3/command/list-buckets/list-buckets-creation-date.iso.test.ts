import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * When a listing says a Bucket was created.
 *
 * Real S3 states this on every Bucket it lists, and the `aws` CLI reads it
 * from each entry, so a Bucket without one cannot be listed at all.
 */
describe("Simulated S3 Bucket creation dates", () => {
  it("records the instant simulated time was at, rather than the host clock's", async () => {
    // Given a simulation whose clock is stopped somewhere the host clock is not
    const instant = new Date("2026-07-26T09:00:00.000Z");
    const simAws = new SimAws({ clock: new SimFixedClock(instant) });

    // When a Bucket is created and then listed
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "widgets" }));
    const listed = await simAws.s3().listBuckets(new ListBucketsCommand({}));

    // Then the listing reports the simulation's instant
    assertDefined(listed.Buckets, "the listed Buckets");
    assertArrayLength(listed.Buckets, 1);
    const [listedBucket] = listed.Buckets;
    assertDefined(listedBucket, "the listed Bucket");
    assertIdentical(
      listedBucket.CreationDate?.toISOString(),
      instant.toISOString(),
    );
  });

  it("keeps the instant each Bucket was created at as the clock moves", async () => {
    // Given a simulation whose clock moves between two Bucket creations
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
    });

    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "first" }));
    await simAws.clock().advanceBy({ hours: 3 });
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "second" }));

    // When both are listed
    const listed = await simAws.s3().listBuckets(new ListBucketsCommand({}));

    // Then each reports when it was made rather than when the listing ran
    assertDefined(listed.Buckets, "the listed Buckets");
    const dates = new Map(
      listed.Buckets.map((bucket) => [
        bucket.Name,
        bucket.CreationDate?.toISOString(),
      ]),
    );

    assertIdentical(dates.get("first"), "2026-07-26T09:00:00.000Z");
    assertIdentical(dates.get("second"), "2026-07-26T12:00:00.000Z");
  });
});

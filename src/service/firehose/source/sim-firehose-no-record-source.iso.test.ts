import {
  assertArrayLength,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";

import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";
import { SimS3 } from "../../s3/sim-s3.js";
import { SimFirehose } from "../sim-firehose.js";
import { SimFirehoseNoRecordSource } from "./sim-firehose-record-source.js";

describe("A simulated Firehose with no simulated Kinesis to read", () => {
  it("says so when a delivery stream is created against a stream", async () => {
    // Given a SimFirehose built on its own, with somewhere to deliver and
    // nothing to read.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const accountRegionScope = simAwsAccountRegionScopeFactory.make();
    const firehose = new SimFirehose({ accountRegionScope, s3: new SimS3() });
    const { accountId, regionName } = accountRegionScope;

    // When a delivery stream is created against a Kinesis stream.
    await firehose.createDeliveryStream({
      input: {
        DeliveryStreamName: "order-events",
        DeliveryStreamType: "KinesisStreamAsSource",
        KinesisStreamSourceConfiguration: {
          KinesisStreamARN: `arn:aws:kinesis:${regionName}:${accountId}:stream/orders`,
          RoleARN: `arn:aws:iam::${accountId}:role/OrderStreamSourceRole`,
        },
        ExtendedS3DestinationConfiguration: {
          BucketARN: "arn:aws:s3:::order-archive",
          RoleARN: `arn:aws:iam::${accountId}:role/OrderArchiveDeliveryRole`,
        },
      },
    });

    // Then the delivery stream was created, and the failure says how to reach
    // a stream rather than leaving the delivery stream quietly reading
    // nothing.
    const failures = firehose.getSourceFailures();
    assertArrayLength(failures, 1);

    const [failure] = failures;
    assertNonNullable(failure, "The read failed and was recorded");
    assertStringIncludes(failure.reason, "no simulated Kinesis");
    assertArrayLength(warn.mock.calls, 1);
  });

  it("refuses every read it is asked for", async () => {
    // Given the record source a SimFirehose falls back to.
    const records = new SimFirehoseNoRecordSource();
    const streamArn = "arn:aws:kinesis:us-east-1:888888888888:stream/orders";

    // When each of the three reads is made.
    const shards = await assertThrowsErrorAsync(async () => {
      await records.describeStream({ input: { StreamARN: streamArn } });
    });
    const iterator = await assertThrowsErrorAsync(async () => {
      await records.getShardIterator({ input: { StreamARN: streamArn } });
    });
    const read = await assertThrowsErrorAsync(async () => {
      await records.getRecords();
    });

    // Then each refuses on its own, rather than one refusing and the next
    // handing back nothing. Finding the shards is the one a delivery stream
    // hits, since it is the read it starts with.
    assertStringIncludes(shards.message, streamArn);
    assertStringIncludes(iterator.message, streamArn);
    assertStringIncludes(read.message, "no simulated Kinesis");
  });

  it("watches nothing", () => {
    // Given the record source a SimFirehose falls back to, and something that
    // would like to hear about records.
    const activity = new SimFirehoseNoRecordSource().streamActivity();
    const watcher = { recordsAvailable: () => undefined };

    // When a stream is watched and then unwatched.
    activity.watch(
      "arn:aws:kinesis:us-east-1:888888888888:stream/orders",
      watcher,
    );
    activity.unwatch(
      "arn:aws:kinesis:us-east-1:888888888888:stream/orders",
      watcher,
    );

    // Then neither did anything. There is no stream to hear from.
  });
});

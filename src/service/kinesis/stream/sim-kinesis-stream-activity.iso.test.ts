import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimKinesisStreamActivity } from "./sim-kinesis-stream-activity.js";

const streamArn = "arn:aws:kinesis:eu-west-2:111111111111:stream/orders";

/**
 * A watcher counting how many times it was told there is something to read.
 */
function countingWatcher(): { readonly told: () => number } & {
  recordsAvailable: () => void;
} {
  let count = 0;

  return {
    recordsAvailable: (): void => {
      count += 1;
    },
    told: (): number => count,
  };
}

describe("What a simulated Kinesis stream tells its watchers", () => {
  it("tells every watcher of the stream", () => {
    // Given two watchers on one stream, which is two mappings polling it.
    const activity = new SimKinesisStreamActivity();
    const first = countingWatcher();
    const second = countingWatcher();

    activity.watch(streamArn, first);
    activity.watch(streamArn, second);

    // When a record is put.
    activity.recordsAvailable(streamArn);

    // Then both are told.
    assertIdentical(first.told(), 1);
    assertIdentical(second.told(), 1);
  });

  it("stops telling a watcher that has stopped, and keeps telling the rest", () => {
    // Given two watchers on one stream.
    const activity = new SimKinesisStreamActivity();
    const staying = countingWatcher();
    const leaving = countingWatcher();

    activity.watch(streamArn, staying);
    activity.watch(streamArn, leaving);

    // When one of them stops watching and a record is put.
    activity.unwatch(streamArn, leaving);
    activity.recordsAvailable(streamArn);

    // Then only the one still watching is told.
    assertIdentical(staying.told(), 1);
    assertIdentical(leaving.told(), 0);
  });

  it("tells nobody about a stream nothing watches", () => {
    // Given a stream whose only watcher has stopped.
    const activity = new SimKinesisStreamActivity();
    const watcher = countingWatcher();

    activity.watch(streamArn, watcher);
    activity.unwatch(streamArn, watcher);

    // When a record is put, and when one is put onto a stream never watched.
    activity.recordsAvailable(streamArn);
    activity.recordsAvailable(
      "arn:aws:kinesis:eu-west-2:111111111111:stream/x",
    );

    // Then nothing is told, and neither call raises.
    assertIdentical(watcher.told(), 0);
  });
});

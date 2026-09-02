import { assertArrayEquals, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLambdaStreamRetryBackoff } from "./sim-lambda-stream-retry-backoff.js";

/**
 * The largest retry quota Lambda takes, which is what a mapping can ask a
 * failed batch to be delivered again for.
 */
const maximumRetryAttempts = 10_000;

describe("the wait before a failed stream batch is delivered again", () => {
  it("doubles for each attempt a test walks through", () => {
    // Given a mapping allowing a handful of retries.
    const backoff = new SimLambdaStreamRetryBackoff(10);

    // When the first three of them are taken.
    const waits = [
      backoff.nextSeconds(),
      backoff.nextSeconds(),
      backoff.nextSeconds(),
    ];

    // Then each waits twice as long as the one before, starting at a second,
    // which is the cadence a test advances the clock through.
    assertArrayEquals(waits, [1, 2, 4]);
  });

  it("starts over once a batch is finished with", () => {
    // Given a backoff that has already waited out two attempts.
    const backoff = new SimLambdaStreamRetryBackoff(10);
    backoff.nextSeconds();
    backoff.nextSeconds();

    // When the batch it was counting for is finished with.
    backoff.reset();

    // Then the next batch waits a second again rather than carrying on from
    // where the last one left off.
    assertArrayEquals([backoff.nextSeconds()], [1]);
  });

  it("stays a wait the simulation's clock can be scheduled at", () => {
    // Given a mapping allowing the most retries Lambda takes, which is more
    // than a doubling wait can go on doubling for.
    const backoff = new SimLambdaStreamRetryBackoff(maximumRetryAttempts);

    // When a batch fails past the point where doubling leaves the range a date
    // can hold.
    let wait = 0;

    for (let attempt = 0; attempt < maximumRetryAttempts; attempt += 1) {
      wait = backoff.nextSeconds();
    }

    // Then the wait is still an instant the clock can be scheduled at, rather
    // than a duration no date can be made from.
    const scheduledAt = new Date(Date.now() + wait * 1000);

    assertTrue(Number.isFinite(scheduledAt.getTime()));
  });
});

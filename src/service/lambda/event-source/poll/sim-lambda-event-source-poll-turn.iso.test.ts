import { assertArrayEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  type SimLambdaEventSourcePolls,
  SimLambdaEventSourcePollTurn,
} from "./sim-lambda-event-source-poll-turn.js";

/**
 * A poller recording what it was asked to do, and letting a test decide when a
 * poll finishes.
 */
class RecordingPoller implements SimLambdaEventSourcePolls {
  public readonly steps: string[] = [];
  public readonly turn = new SimLambdaEventSourcePollTurn(this);

  private finish: (() => void) | undefined;

  async poll(): Promise<void> {
    this.steps.push("polled");

    await new Promise<void>((resolve) => {
      this.finish = resolve;
    });
  }

  pollNow(): void {
    this.steps.push("asked again");
  }

  /**
   * Let the poll that is in flight finish.
   */
  finishPoll(): void {
    this.finish?.();
  }
}

describe("sim Lambda event source poll turns", () => {
  it("keeps a second poll from starting while one is in flight", async () => {
    // Given a poller part way through a poll.
    const poller = new RecordingPoller();
    const inFlight = poller.turn.take();

    // When another turn is taken before the first has finished.
    const second = poller.turn.take();

    // Then only one poll ran, and the second was remembered rather than
    // dropped: records that arrived mid-poll would otherwise sit until an
    // unrelated later write happened to wake the mapping.
    await second;
    poller.finishPoll();
    await inFlight;

    assertArrayEquals(poller.steps, ["polled", "asked again"]);
  });

  it("asks for nothing more when nothing arrived during a poll", async () => {
    // Given a poller taking a turn with nothing else asking for one.
    const poller = new RecordingPoller();
    const inFlight = poller.turn.take();

    // When the poll finishes.
    poller.finishPoll();
    await inFlight;

    // Then the mapping waits to be woken rather than polling round again.
    assertArrayEquals(poller.steps, ["polled"]);
  });
});

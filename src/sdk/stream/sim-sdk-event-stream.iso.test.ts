import {
  assertArrayEquals,
  assertIdentical,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simSdkEventStream } from "./sim-sdk-event-stream.js";

/**
 * Read a stream the way production code reads one.
 */
async function collected<TEvent>(
  stream: AsyncIterable<TEvent>,
): Promise<TEvent[]> {
  const read: TEvent[] = await Array.fromAsync(stream);

  return read;
}

describe("Simulated SDK event stream", () => {
  it("yields its events in the order they were given", async () => {
    // Given a stream over three events.
    const stream = simSdkEventStream(["first", "second", "third"]);

    // When it is read.
    const read = await collected(stream);

    // Then the order is the one the operation built.
    assertArrayEquals(read, ["first", "second", "third"]);
  });

  it("refuses a second reading", async () => {
    // Given a stream that has been read.
    const stream = simSdkEventStream(["first"]);

    await collected(stream);

    // When it is read again.
    const error = await assertThrowsErrorAsync(
      async () => await collected(stream),
    );

    // Then it raises, as a socket read to the end would.
    assertIdentical(error.name, "SimSdkStreamAlreadyConsumedError");
  });

  it("counts an abandoned reading as a reading", async () => {
    // Given a stream whose reader stopped after one event.
    const stream = simSdkEventStream(["first", "second"]);
    const reader = stream[Symbol.asyncIterator]();

    const first = await reader.next();

    assertIdentical(first.value, "first");

    // When it is read again.
    const error = await assertThrowsErrorAsync(
      async () => await collected(stream),
    );

    // Then the events already consumed are gone, as they would be on a socket.
    assertIdentical(error.name, "SimSdkStreamAlreadyConsumedError");
  });

  it("yields nothing for an operation with no events", async () => {
    // Given a stream over no events.
    const stream = simSdkEventStream([]);

    // When it is read.
    const read = await collected(stream);

    // Then it ends immediately rather than waiting for something to arrive.
    assertArrayEquals(read, []);
  });
});

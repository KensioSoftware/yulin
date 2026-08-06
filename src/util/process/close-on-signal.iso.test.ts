import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { closeOnSignal } from "./close-on-signal.js";

/**
 * The signal handler nothing gets unless it asks for one.
 */
describe("closing on a signal", () => {
  it("closes when the process is asked to stop", async () => {
    // Given something that asked to be closed on a signal
    const closed = new ClosingRecord();
    closeOnSignal(closed.close);

    // When the terminal is interrupted
    process.emit("SIGINT");
    await settled();

    // Then it was closed
    assertIdentical(closed.count(), 1);
  });

  it("closes for a termination signal as well", async () => {
    // Given something that asked to be closed on a signal
    const closed = new ClosingRecord();
    closeOnSignal(closed.close);

    // When the process is asked to terminate, as a supervisor asks
    process.emit("SIGTERM");
    await settled();

    // Then it was closed
    assertIdentical(closed.count(), 1);
  });

  it("hands the process back after the first signal", async () => {
    // Given something that asked to be closed on a signal
    const closed = new ClosingRecord();
    const listening = signalListeners();
    closeOnSignal(closed.close);

    // When the same signal arrives twice, as it does from someone who has
    // waited long enough and pressed Ctrl-C again
    process.emit("SIGINT");
    process.emit("SIGINT");
    await settled();

    // Then closing ran once, and the second signal landed on Node's own
    // default rather than on a handler that would have held the process here
    assertIdentical(closed.count(), 1);
    assertArrayEquals(signalListeners(), listening);
  });

  it("takes the handlers off when it is asked to", async () => {
    // Given something that asked to be closed on a signal, and then stopped
    // wanting that before the process ended
    const closed = new ClosingRecord();
    const listening = signalListeners();
    const stopListening = closeOnSignal(closed.close);

    // When the handlers are taken off, and the signal arrives afterwards
    stopListening();
    process.emit("SIGTERM");
    await settled();

    // Then nothing was closed, and nothing is listening
    assertIdentical(closed.count(), 0);
    assertArrayEquals(signalListeners(), listening);
  });

  it("listens for the signals it was named, and no others", async () => {
    // Given something that asked to be closed on one signal of its choosing
    const closed = new ClosingRecord();
    const stopListening = closeOnSignal(closed.close, { signals: ["SIGHUP"] });

    // When a signal it did not name arrives
    process.emit("SIGINT");
    await settled();

    // Then nothing was closed, and the signal it did name still closes it
    assertIdentical(closed.count(), 0);
    process.emit("SIGHUP");
    await settled();
    assertIdentical(closed.count(), 1);

    stopListening();
  });
});

/**
 * Something to close, that says how many times it was closed.
 */
class ClosingRecord {
  readonly close = async (): Promise<void> => {
    this.closes += 1;
    await Promise.resolve();
  };

  private closes = 0;

  /**
   * How many times closing has been asked for.
   */
  count(): number {
    return this.closes;
  }
}

/**
 * How many listeners the signals are carrying, so a test can say a handler was
 * installed and taken off again without assuming it was the only one.
 */
function signalListeners(): readonly number[] {
  return [
    process.listenerCount("SIGINT"),
    process.listenerCount("SIGTERM"),
    process.listenerCount("SIGHUP"),
  ];
}

/**
 * Let the close a signal handler started finish, since a handler cannot be
 * awaited by whatever raised the signal.
 */
async function settled(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

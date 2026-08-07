import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  isWatchPathMessage,
  waitWatchMessage,
} from "./sim-watch-child-message.js";

describe("watch child messages", () => {
  it("recognises a message naming a path", () => {
    // Given a message from a supervised process
    const message = { type: "yulin:watch-path", path: "/projects/assets" };

    // When it is read
    const isPath = isWatchPathMessage(message, "yulin:watch-path");

    // Then the path is there to be watched
    assertTrue(isPath);
  });

  it.each([
    [{ type: "yulin:watch-path" }],
    [{ type: "yulin:watch-path", path: 7 }],
    [{ type: "something-else", path: "/projects/assets" }],
    ["not a message at all"],
    [null],
  ])("does not take %s for a path message", (message) => {
    // Given something that is not a path message
    // When it is read
    const isPath = isWatchPathMessage(message, "yulin:watch-path");

    // Then nothing is watched on the strength of it
    assertFalse(isPath);
  });

  it("waits for the message it was told to wait for", async () => {
    // Given a process that is going to answer
    const childProcess = new FakeChildProcess();
    const waiting = waitWatchMessage(
      childProcess.asChildProcess(),
      "yulin:watch-stopped",
      5000,
    );

    // When it answers
    childProcess.emit("message", { type: "yulin:watch-stopped" });
    await waiting;

    // Then the wait is over, and nothing is left listening
    assertFalse(childProcess.listenerCount("message") > 0);
  });

  it("gives up on a process that never answers", async () => {
    // Given a process not running Yulin's runtime, which will never answer
    const childProcess = new FakeChildProcess();

    // When it is waited for
    await waitWatchMessage(
      childProcess.asChildProcess(),
      "yulin:watch-stopped",
      20,
    );

    // Then the wait ends anyway, since the answer was never a requirement
    assertFalse(childProcess.listenerCount("message") > 0);
  });

  it("keeps waiting through a message of another kind", async () => {
    // Given a process still reporting paths as it shuts down
    const childProcess = new FakeChildProcess();
    const waiting = waitWatchMessage(
      childProcess.asChildProcess(),
      "yulin:watch-stopped",
      5000,
    );

    // When one of those arrives, and then the answer
    childProcess.emit("message", { type: "yulin:watch-path", path: "/a" });
    childProcess.emit("message", { type: "yulin:watch-stopped" });
    await waiting;

    // Then it was the answer that ended the wait
    assertFalse(childProcess.listenerCount("message") > 0);
  });
});

// oxlint-disable-next-line unicorn-js/prefer-event-target
class FakeChildProcess extends EventEmitter {
  asChildProcess(): ChildProcess {
    return this as unknown as ChildProcess;
  }
}

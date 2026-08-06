import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { RecordedRestarts } from "../../../test/cli/recorded-restarts.js";

describe("SimWatchRestarts", () => {
  it("restarts for a change when nothing else is running", async () => {
    // Given a watcher with no restart under way
    const restarts = new RecordedRestarts();

    // When a change arrives
    restarts.request("src/handler.ts");
    restarts.release();
    await restarts.settle();

    // Then it is restarted for
    assertArrayEquals(restarts.restarted, ["src/handler.ts"]);
  });

  it("runs a change that arrived during a restart afterwards", async () => {
    // Given a restart already under way
    const restarts = new RecordedRestarts();
    restarts.request("src/first.ts");

    // When another change arrives before it finishes
    restarts.request("src/second.ts");
    restarts.release();
    await restarts.settle();
    restarts.release();
    await restarts.settle();

    // Then the edit made during the restart is not lost
    assertArrayEquals(restarts.restarted, ["src/first.ts", "src/second.ts"]);
  });

  it("keeps only the latest change made during a restart", async () => {
    // Given a restart already under way
    const restarts = new RecordedRestarts();
    restarts.request("src/first.ts");

    // When several changes arrive before it finishes
    restarts.request("src/second.ts");
    restarts.request("src/third.ts");
    restarts.release();
    await restarts.settle();
    restarts.release();
    await restarts.settle();

    // Then one restart follows, for what is on disk now
    assertArrayEquals(restarts.restarted, ["src/first.ts", "src/third.ts"]);
  });

  it("reports a restart that failed", async () => {
    // Given a restart that is going to throw
    const restarts = new RecordedRestarts({ failWith: new Error("no port") });

    // When a change arrives
    restarts.request("src/handler.ts");
    restarts.release();
    await restarts.settle();

    // Then the failure is reported rather than swallowed
    assertIdentical(restarts.failures.at(0), "no port");
  });

  it("restarts again after one that failed", async () => {
    // Given a restart that threw
    const restarts = new RecordedRestarts({ failWith: new Error("no port") });
    restarts.request("src/first.ts");
    restarts.release();
    await restarts.settle();

    // When the next change arrives
    restarts.stopFailing();
    restarts.request("src/second.ts");
    restarts.release();
    await restarts.settle();

    // Then it is restarted for, rather than the queue being stuck
    assertArrayEquals(restarts.restarted, ["src/first.ts", "src/second.ts"]);
  });
});

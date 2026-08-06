import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  SimWatchLoopGuard,
  SimWatchRestartLoop,
} from "./sim-watch-loop-guard.js";

describe("SimWatchLoopGuard", () => {
  it("refuses a process that keeps changing the same file on startup", () => {
    // Given setup that writes a template into a watched path
    const guard = new SimWatchLoopGuard({
      selfInflictedMs: 1000,
      loopRestarts: 3,
    });
    guard.check("cdk.out/Stack.template.json", 50);
    guard.check("cdk.out/Stack.template.json", 50);

    // When it does it again straight after another start
    const error = assertThrowsError(() => {
      guard.check("cdk.out/Stack.template.json", 50);
    });

    // Then it stops, naming the file rather than spinning on it
    assertInstanceOf(error, SimWatchRestartLoop);
    assertStringIncludes(error.message, "cdk.out/Stack.template.json");
    assertStringIncludes(error.message, "writes to a watched path");
  });

  it("allows a change made after the process has been up a while", () => {
    // Given a process that has been running long enough for a person to type
    const guard = new SimWatchLoopGuard({
      selfInflictedMs: 1000,
      loopRestarts: 3,
    });

    // When the same file is saved several times over
    guard.check("src/handler.ts", 30_000);
    guard.check("src/handler.ts", 20_000);
    guard.check("src/handler.ts", 12_000);

    // Then nothing is refused, since none of it was the process itself
  });

  it("allows fast changes to different files", () => {
    // Given fast restarts, but each from a different file
    const guard = new SimWatchLoopGuard({
      selfInflictedMs: 1000,
      loopRestarts: 3,
    });

    // When they arrive straight after startup
    guard.check("src/one.ts", 40);
    guard.check("src/two.ts", 40);
    guard.check("src/three.ts", 40);

    // Then it is someone saving quickly, not a loop
  });

  it("starts counting again after an unrelated change", () => {
    // Given a run of self-inflicted restarts that was interrupted
    const guard = new SimWatchLoopGuard({
      selfInflictedMs: 1000,
      loopRestarts: 3,
    });
    guard.check("cdk.out/Stack.template.json", 50);
    guard.check("cdk.out/Stack.template.json", 50);
    guard.check("src/handler.ts", 50);

    // When the template changes on startup again
    guard.check("cdk.out/Stack.template.json", 50);

    // Then the count is starting over rather than tripping straight away
  });
});

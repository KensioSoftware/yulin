import path from "node:path";
import { assertArrayEquals, assertStringIncludes } from "@kensio/smartass";
import { describe, it, vi } from "vitest";
import { SimWatchReporter } from "./sim-watch-reporter.js";

const cwd = path.resolve("/projects/media");

describe("SimWatchReporter", () => {
  it("says what it is watching and what it is running", () => {
    // Given a supervisor that has just started
    const lines: string[] = [];
    const reporter = new SimWatchReporter({ cwd, write: lineTo(lines) });

    // When it reports itself
    reporter.started("tsx dev.ts");

    // Then it is clear something is watching, and what it started
    assertArrayEquals(lines, ["yulin watch: watching ., running tsx dev.ts\n"]);
  });

  it("reports a restart with what caused it and what it cost", () => {
    // Given a restart from a file inside the project
    const lines: string[] = [];
    const reporter = new SimWatchReporter({ cwd, write: lineTo(lines) });

    // When it is reported
    reporter.restarted(path.join(cwd, "src", "handler.ts"), 412.6);

    // Then the path is the part that changed, not the part that never does
    assertArrayEquals(lines, [
      `yulin watch: restarted in 413ms after ${path.join("src", "handler.ts")}\n`,
    ]);
  });

  it("reports a path outside the project in full", () => {
    // Given a change to a directory mounted from elsewhere
    const lines: string[] = [];
    const reporter = new SimWatchReporter({ cwd, write: lineTo(lines) });
    const outside = path.resolve("/shared/assets/logo.svg");

    // When it is reported
    reporter.restarted(outside, 10);

    // Then it is named in full, since a relative path to it says less
    assertStringIncludes(lines[0] ?? "", outside);
  });

  it("reports a process that stopped on its own", () => {
    // Given a setup script that threw
    const lines: string[] = [];
    const reporter = new SimWatchReporter({ cwd, write: lineTo(lines) });

    // When the process exits
    reporter.exited(1, null);

    // Then the watching is said to continue, so the next save is the retry
    assertStringIncludes(lines[0] ?? "", "code 1");
    assertStringIncludes(lines[0] ?? "", "waiting for a change");
  });

  it("reports a process that was killed", () => {
    // Given a process taken down by a signal
    const lines: string[] = [];
    const reporter = new SimWatchReporter({ cwd, write: lineTo(lines) });

    // When the exit is reported
    reporter.exited(null, "SIGKILL");

    // Then the signal is named rather than an exit code that never came
    assertStringIncludes(lines[0] ?? "", "SIGKILL");
  });

  it("writes to standard error, leaving standard output to the process", () => {
    // Given a reporter with nowhere told to write
    const written: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk): boolean => {
      written.push(String(chunk));
      return true;
    });

    // When it reports something
    new SimWatchReporter().started("tsx dev.ts");

    // Then it goes to standard error, so a piped standard output stays clean
    assertStringIncludes(written.join(""), "running tsx dev.ts");
  });

  it("reports what stopped the watching", () => {
    // Given something the watcher cannot carry on through
    const lines: string[] = [];
    const reporter = new SimWatchReporter({ cwd, write: lineTo(lines) });

    // When it is reported
    reporter.failed(new Error("Restart loop: dev.ts changed"));

    // Then the message is what the terminal shows
    assertStringIncludes(lines[0] ?? "", "Restart loop: dev.ts changed");
  });
});

function lineTo(lines: string[]): (line: string) => void {
  return (line: string): void => {
    lines.push(line);
  };
}

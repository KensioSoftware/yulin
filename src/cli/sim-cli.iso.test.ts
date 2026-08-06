import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";
import { SimCli, SimCliUnknownCommand } from "./sim-cli.js";

describe("SimCli", () => {
  it("shows what it can do when asked", () => {
    // Given the CLI run with no command
    const written = captureStdout();

    // When it is asked for help
    void new SimCli().run(["--help"]);

    // Then the commands are listed
    assertStringIncludes(written.join(""), "watch [--inspect");
  });

  it("reports a run with no command as a mistake", async () => {
    // Given the CLI run with nothing to do
    captureStdout();

    // When it runs
    const exitCode = await new SimCli().run([]);

    // Then it says so through its exit code, since a shell may be reading it
    assertIdentical(exitCode, 1);
  });

  it("hands a watch over to the watch command", async () => {
    // Given a watch with no command after the separator
    const cli = new SimCli();

    // When it is run
    const error = await assertThrowsErrorAsync(async () => {
      await cli.run(["watch"]);
    });

    // Then it is the watch command that read it, and said how to write it
    assertStringIncludes(error.message, "Usage: yulin watch");
  });

  it("refuses a command it does not have", async () => {
    // Given a command that does not exist
    const cli = new SimCli();

    // When it is run
    const error = await assertThrowsErrorAsync(async () => {
      await cli.run(["serve"]);
    });

    // Then it names the command and says what there is instead
    assertInstanceOf(error, SimCliUnknownCommand);
    assertStringIncludes(error.message, "Unknown command serve.");
    assertStringIncludes(error.message, "watch [--inspect");
  });
});

function captureStdout(): string[] {
  const written: string[] = [];

  vi.spyOn(process.stdout, "write").mockImplementation((chunk): boolean => {
    written.push(String(chunk));
    return true;
  });

  return written;
}

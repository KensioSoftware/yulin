import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  SimWatchArguments,
  SimWatchUsageError,
} from "./sim-watch-arguments.js";

describe("SimWatchArguments", () => {
  it("takes everything after the separator as the command", () => {
    // Given a command with options of its own
    const argv = ["--", "tsx", "dev.ts", "--seed", "small"];

    // When the arguments are read
    const parsed = SimWatchArguments.parse(argv);

    // Then the command keeps its own options, unread by watch
    assertIdentical(parsed.command, "tsx");
    assertArrayEquals(parsed.commandArguments, ["dev.ts", "--seed", "small"]);
    assertUndefined(parsed.inspect);
  });

  it("passes an inspector flag through", () => {
    // Given a run that wants a debugger attached
    const argv = ["--inspect=9230", "--", "tsx", "dev.ts"];

    // When the arguments are read
    const parsed = SimWatchArguments.parse(argv);

    // Then the flag is kept for the process being run, not for the supervisor
    assertIdentical(parsed.inspect, "--inspect=9230");
    assertIdentical(parsed.command, "tsx");
  });

  it("refuses a run with no separator", () => {
    // Given a command written without the separator
    const argv = ["tsx", "dev.ts"];

    // When the arguments are read
    const error = assertThrowsError(() => SimWatchArguments.parse(argv));

    // Then it says where the command goes and why
    assertInstanceOf(error, SimWatchUsageError);
    assertStringIncludes(error.message, "after --");
    assertStringIncludes(error.message, "Usage: yulin watch");
  });

  it("refuses a separator with nothing after it", () => {
    // Given a separator and no command
    const argv = ["--inspect", "--"];

    // When the arguments are read
    const error = assertThrowsError(() => SimWatchArguments.parse(argv));

    // Then it says there is nothing to run
    assertInstanceOf(error, SimWatchUsageError);
    assertStringIncludes(error.message, "No command given after --.");
  });

  it("refuses an option it does not have", () => {
    // Given an option meant for the command, written before the separator
    const argv = ["--seed", "--", "tsx", "dev.ts"];

    // When the arguments are read
    const error = assertThrowsError(() => SimWatchArguments.parse(argv));

    // Then it names the option rather than passing it on
    assertInstanceOf(error, SimWatchUsageError);
    assertStringIncludes(error.message, "Unknown option --seed.");
  });

  it("describes the command it was given", () => {
    // Given a parsed command
    const parsed = SimWatchArguments.parse(["--", "node", "dev.js", "--quiet"]);

    // When it is described for the terminal
    const described = parsed.describe();

    // Then it reads as it was written
    assertIdentical(described, "node dev.js --quiet");
  });
});

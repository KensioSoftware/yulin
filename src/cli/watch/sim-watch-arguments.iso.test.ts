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

  it("takes a settle window for a project the default does not suit", () => {
    // Given a build whose writes come in further apart than most
    const argv = ["--settle=800", "--inspect", "--", "tsx", "dev.ts"];

    // When the arguments are read
    const parsed = SimWatchArguments.parse(argv);

    // Then the window is watch's own option, alongside one for the command
    assertIdentical(parsed.settleMs, 800);
    assertIdentical(parsed.inspect, "--inspect");
    assertIdentical(parsed.command, "tsx");
  });

  it("leaves the settle window alone when it was not asked about", () => {
    // Given a watch written without the option
    const argv = ["--", "tsx", "dev.ts"];

    // When the arguments are read
    const parsed = SimWatchArguments.parse(argv);

    // Then the default window is what the watcher will use
    assertUndefined(parsed.settleMs);
  });

  it("refuses a settle window that is not a number of milliseconds", () => {
    // Given a window written as a word
    const argv = ["--settle=slowly", "--", "tsx", "dev.ts"];

    // When the arguments are read
    const error = assertThrowsError(() => SimWatchArguments.parse(argv));

    // Then it says how the option is written
    assertInstanceOf(error, SimWatchUsageError);
    assertStringIncludes(error.message, "--settle takes a number");
    assertStringIncludes(error.message, "--settle=250");
  });

  it("refuses a settle window with no value", () => {
    // Given the option written as though it took the next word
    const argv = ["--settle", "250", "--", "tsx", "dev.ts"];

    // When the arguments are read
    const error = assertThrowsError(() => SimWatchArguments.parse(argv));

    // Then it says how the option is written, rather than reading 250 as an
    // option of its own
    assertInstanceOf(error, SimWatchUsageError);
    assertStringIncludes(error.message, "--settle takes a number");
  });

  it("refuses a settle window of nothing at all", () => {
    // Given a window that would act on every event separately
    const argv = ["--settle=0", "--", "tsx", "dev.ts"];

    // When the arguments are read
    const error = assertThrowsError(() => SimWatchArguments.parse(argv));

    // Then it is refused rather than turning one save into several restarts
    assertInstanceOf(error, SimWatchUsageError);
    assertStringIncludes(error.message, "--settle takes a number");
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

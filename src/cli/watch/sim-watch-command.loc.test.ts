import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimWatchCommand } from "./sim-watch-command.js";
import { SimWatchUsageError } from "./sim-watch-arguments.js";
import { SimWatchReporter } from "./sim-watch-reporter.js";
import {
  watchChildScript,
  WatchProject,
  watchPause,
} from "../../../test/cli/watch-project.js";

describe("SimWatchCommand", () => {
  it("refuses a run with nothing to do before starting anything", async () => {
    // Given a watch with no command after the separator
    const command = new SimWatchCommand();

    // When it is run
    const error = await assertThrowsErrorAsync(async () => {
      await command.run([]);
    });

    // Then it says how to write it, having started no process
    assertInstanceOf(error, SimWatchUsageError);
    assertStringIncludes(error.message, "Usage: yulin watch");
  });

  it("stops the process it started when it is interrupted", async () => {
    // Given a watch running a real process
    const project = await WatchProject.of({
      "message.mjs": 'export const message = "first";',
    });
    await project.write("dev.mjs", watchChildScript(project.runsLogPath()));
    const lines: string[] = [];
    const command = new SimWatchCommand({
      cwd: project.path(),
      reporter: new SimWatchReporter({
        cwd: project.path(),
        write: (line) => {
          lines.push(line);
        },
      }),
    });
    await project.settled();
    const running = command.run(["--", process.execPath, "dev.mjs"]);
    await project.untilRuns(1);

    // When the terminal is interrupted
    process.emit("SIGINT");
    const exitCode = await running;

    // Then it ends cleanly, and nothing is left holding the terminal
    assertIdentical(exitCode, 0);
    assertArrayEquals(process.listeners("SIGINT"), []);

    await watchPause(100);
    assertArrayEquals([...(await project.runs())], ["first"]);
  });
});

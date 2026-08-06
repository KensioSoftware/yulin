import {
  assertIdentical,
  assertStringIncludes,
  assertArrayLength,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimWatchChild } from "./sim-watch-child.js";
import { WatchProject } from "../../../test/cli/watch-project.js";
import { untilExited } from "../../../test/cli/until-exited.js";
import { simWatchConfig } from "../../watch/sim-watch.config.js";

describe("SimWatchChild over a real process", () => {
  it("fails when the command cannot be run", async () => {
    // Given a command that is not on the path
    const project = await WatchProject.of({});
    const child = childOf(project, "definitely-not-a-command", []);

    // When it is started
    const error = await assertThrowsErrorAsync(async () => {
      await child.started();
    });

    // Then it says which command could not be run, rather than looking like a
    // process that started and stopped
    assertStringIncludes(error.message, "definitely-not-a-command");
  });

  it("reports a process that stopped on its own", async () => {
    // Given a process that runs to the end
    const project = await WatchProject.of({});
    const exits: (number | null)[] = [];
    const child = childOf(
      project,
      process.execPath,
      ["-e", "process.exit(3)"],
      {
        onExit: (code) => {
          exits.push(code);
        },
      },
    );
    await child.started();

    // When it exits
    await untilExited(exits);

    // Then the supervisor hears about it
    assertIdentical(exits.at(0), 3);
  });

  it("says nothing about an exit it asked for", async () => {
    // Given a process that stays up
    const project = await WatchProject.of({});
    const exits: (number | null)[] = [];
    const child = childOf(
      project,
      process.execPath,
      ["-e", "setInterval(() => {}, 60000)"],
      {
        onExit: (code) => {
          exits.push(code);
        },
      },
    );
    await child.started();

    // When it is stopped on purpose
    await child.stop();

    // Then that is not reported as a process that stopped on its own
    assertArrayLength(exits, 0);
  });

  it("kills a process that will not go on being asked", async () => {
    // Given a process that refuses to stop when it is asked
    const project = await WatchProject.of({});
    const child = childOf(project, process.execPath, [
      "-e",
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 60000)",
    ]);
    await child.started();

    // When it is stopped
    const startedAt = Date.now();
    await child.stop();

    // Then it goes anyway, so the port is free for the process replacing it
    assertTrue(Date.now() - startedAt >= simWatchConfig.exitMs);
  });
});

interface ChildOfProperties {
  readonly onExit?: (code: number | null) => void;
}

function childOf(
  project: WatchProject,
  command: string,
  commandArguments: readonly string[],
  properties: ChildOfProperties = {},
): SimWatchChild {
  return new SimWatchChild({
    command,
    args: commandArguments,
    cwd: project.path(),
    env: process.env,
    onPath: () => undefined,
    onExit: (code) => {
      properties.onExit?.(code);
    },
  });
}

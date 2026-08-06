import {
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimWatchArguments } from "./sim-watch-arguments.js";
import { SimWatchReporter } from "./sim-watch-reporter.js";
import { SimWatchSupervisor } from "./sim-watch-supervisor.js";
import {
  inspectedChildScript,
  selfWritingChildScript,
  throwingChildScript,
  WatchProject,
  watchPause,
} from "../../../test/cli/watch-project.js";
import { listenOnFreePort, serverPort } from "../../../test/serve/held-port.js";

const message = (value: string): string =>
  `export const message = ${JSON.stringify(value)};`;

describe("yulin watch when a run goes wrong", () => {
  it("keeps watching after a setup that threw", async () => {
    // Given a supervised process whose setup fails on startup
    const project = await WatchProject.of({ "message.mjs": message("broken") });
    await project.write("dev.mjs", throwingChildScript(project.runsLogPath()));
    const reported: string[] = [];
    const supervisor = supervise(project, reported);
    await project.settled();
    const running = supervisor.run();
    await project.untilRuns(1);
    await watchPause(300);

    // When the mistake is fixed and saved
    await project.write("message.mjs", message("fixed"));

    // Then the next save is the retry, with no watch to start over
    const runs = await project.untilRuns(2);
    assertArrayEquals([...runs], ["broken", "fixed"]);
    assertStringIncludes(reported.join(""), "waiting for a change");

    supervisor.interrupt();
    await running;
  });

  it("refuses a process that keeps restarting itself", async () => {
    // Given a supervised process that writes into its own watched directory
    const project = await WatchProject.of({});
    await project.write(
      "dev.mjs",
      selfWritingChildScript(project.runsLogPath()),
    );
    const reported: string[] = [];
    const supervisor = supervise(project, reported);
    await project.settled();

    // When it is left to run
    const exitCode = await supervisor.run();

    // Then it stops, naming the file, rather than restarting forever
    assertIdentical(exitCode, 1);
    assertStringIncludes(reported.join(""), "Restart loop");
    assertStringIncludes(reported.join(""), "generated.json");
  });

  it("keeps a debugger able to attach across a restart", async () => {
    // Given a supervised process started with an inspector port
    const holder = await listenOnFreePort();
    const inspectorPort = serverPort(holder);
    holder.close();

    const project = await WatchProject.of({ "message.mjs": message("first") });
    await project.write("dev.mjs", inspectedChildScript(project.runsLogPath()));
    const supervisor = supervise(
      project,
      [],
      `--inspect=${String(inspectorPort)}`,
    );
    await project.settled();
    const running = supervisor.run();
    await project.untilRuns(1);

    // When it restarts
    await project.write("message.mjs", message("second"));

    // Then the replacement has the inspector too, on the port the last one let
    // go of
    const runs = await project.untilRuns(2);
    assertArrayEquals([...runs], ["first inspector", "second inspector"]);

    supervisor.interrupt();
    await running;
  });
});

function supervise(
  project: WatchProject,
  reported: string[],
  inspect?: string,
): SimWatchSupervisor {
  return new SimWatchSupervisor({
    watchArguments: SimWatchArguments.parse([
      ...(inspect === undefined ? [] : [inspect]),
      "--",
      process.execPath,
      "dev.mjs",
    ]),
    cwd: project.path(),
    reporter: new SimWatchReporter({
      cwd: project.path(),
      write: (line) => {
        reported.push(line);
      },
    }),
  });
}

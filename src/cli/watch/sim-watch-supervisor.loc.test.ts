import { assertArrayEquals, assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimWatchArguments } from "./sim-watch-arguments.js";
import { SimWatchReporter } from "./sim-watch-reporter.js";
import { SimWatchSupervisor } from "./sim-watch-supervisor.js";
import {
  reportingChildScript,
  watchChildScript,
  WatchProject,
  watchPause,
} from "../../../test/cli/watch-project.js";

const message = (value: string): string =>
  `export const message = ${JSON.stringify(value)};`;

describe("yulin watch over a real process", () => {
  it("restarts the process when a watched file changes", async () => {
    // Given a supervised process that has started once
    const project = await WatchProject.of({
      "message.mjs": message("first"),
    });
    await project.write("dev.mjs", watchChildScript(project.runsLogPath()));
    const supervisor = supervise(project);
    await project.settled();
    const running = supervisor.run();
    await project.untilRuns(1);

    // When a file it imports is saved
    await project.write("message.mjs", message("second"));

    // Then it runs again, with the change in it
    const runs = await project.untilRuns(2);
    assertArrayEquals([...runs], ["first", "second"]);

    supervisor.interrupt();
    await running;
  });

  it("makes one restart out of a burst of saves", async () => {
    // Given a supervised process that has started once
    const project = await WatchProject.of({
      "message.mjs": message("first"),
    });
    await project.write("dev.mjs", watchChildScript(project.runsLogPath()));
    const supervisor = supervise(project);
    await project.settled();
    const running = supervisor.run();
    await project.untilRuns(1);

    // When several writes land in quick succession, as one save does
    await project.write("message.mjs", message("a"));
    await project.write("message.mjs", message("b"));
    await project.write("message.mjs", message("last"));

    // Then there is one more run, not one for each write
    const runs = await project.untilRuns(2);
    assertArrayEquals([...runs], ["first", "last"]);
    await watchPause(400);
    assertArrayLength(await project.runs(), 2);

    supervisor.interrupt();
    await running;
  });

  it("watches a directory the process reported", async () => {
    // Given a supervised process that named a directory outside the project,
    // the way a mounted Bucket directory or a deployed template is named
    const project = await WatchProject.of({});
    await project.write(
      "dev.mjs",
      reportingChildScript(project.runsLogPath(), project.mountedPath()),
    );
    const supervisor = supervise(project);
    await project.settled();
    const running = supervisor.run();
    await project.untilRuns(1);
    await watchPause(200);

    // When a file changes in that directory
    await project.writeMounted("logo.svg", "<svg></svg>");

    // Then the process runs again, without the directory having been listed
    await project.untilRuns(2);

    supervisor.interrupt();
    await running;
  });
});

function supervise(project: WatchProject): SimWatchSupervisor {
  return new SimWatchSupervisor({
    watchArguments: SimWatchArguments.parse([
      "--",
      process.execPath,
      "dev.mjs",
    ]),
    cwd: project.path(),
    reporter: new SimWatchReporter({
      cwd: project.path(),
      write: () => undefined,
    }),
  });
}

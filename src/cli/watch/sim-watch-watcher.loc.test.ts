import path from "node:path";
import {
  assertArrayEquals,
  assertArrayLength,
  assertNumberBetween,
  assertStringEndsWith,
  assertStringStartsWith,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimWatchWatcher } from "./sim-watch-watcher.js";
import { simWatchConfig } from "../../watch/sim-watch.config.js";
import { TemporaryDirectory } from "../../util/filesystem/temporary-directory.js";
import { watchPause } from "../../../test/cli/watch-project.js";

describe("SimWatchWatcher over a real directory", () => {
  it("reports a file saved in the working directory", async () => {
    // Given a watched working directory
    const { directory, changes, watcher } = await watching();

    try {
      // When a file in it is saved
      await directory.writeFile("handler.ts", "export const a = 1;");
      await watchPause(400);

      // Then the change is reported, by name
      assertStringEndsWith(changes.at(0) ?? "", "handler.ts");
    } finally {
      watcher.stop();
    }
  });

  it("makes one change out of a build writing several hundred files", async () => {
    // Given a watched working directory settling at the window a project gets
    // by default
    const { directory, changes, changedAt, watcher } = await watching({
      settleMs: simWatchConfig.settleMs,
    });

    try {
      // When a build writes a few hundred files into it, which the platform
      // delivers in waves rather than all at once
      //
      // Into the directory already being watched rather than a new one of its
      // own: a directory arriving is a change in its own right, and one a
      // recursive watch only sees inside once it has caught up with it.
      await Promise.all(
        Array.from({ length: 500 }, async (_, at) =>
          directory.writeFile(
            `page-${String(at)}.html`,
            `<h1>page ${String(at)}</h1>`,
          ),
        ),
      );
      const writtenAt = Date.now();
      await watchPause(simWatchConfig.settleMs * 6);

      // Then the build is one restart, taken shortly after its last write
      // rather than once per wave
      assertArrayLength(changes, 1);
      assertNumberBetween(
        (changedAt.at(0) ?? 0) - writtenAt,
        0,
        simWatchConfig.settleMs * 4,
      );
    } finally {
      watcher.stop();
    }
  });

  it("passes over a file nothing edits by hand", async () => {
    // Given a watched working directory
    const { directory, changes, watcher } = await watching();

    try {
      // When something writes into a directory the rules skip
      await directory.writeFile(["node_modules", "left", "index.js"], "1;");
      await watchPause(400);

      // Then nothing is restarted for it
      assertArrayEquals(changes, []);
    } finally {
      watcher.stop();
    }
  });

  it("watches a reported directory outside the working directory", async () => {
    // Given a directory the supervised process named
    const { changes, watcher } = await watching();
    const mounted = new TemporaryDirectory();
    await mounted.resolvePath();
    await mounted.writeFile("logo.svg", "<svg></svg>");
    watcher.addReported(mounted.path());
    await watchPause(200);

    try {
      // When a file in it changes
      await mounted.writeFile("logo.svg", "<svg><g /></svg>");
      await watchPause(400);

      // Then it is watched, without having been listed anywhere
      assertStringStartsWith(changes.at(0) ?? "", mounted.path());
    } finally {
      watcher.stop();
    }
  });

  it("watches a reported file outside the working directory", async () => {
    // Given a synthesized template the supervised process deployed
    const { changes, watcher } = await watching();
    const synth = new TemporaryDirectory();
    await synth.resolvePath();
    await synth.writeFile("Stack.template.json", "{}");
    watcher.addReported(synth.join("Stack.template.json"));
    await watchPause(200);

    try {
      // When it is synthesized again
      await synth.writeFile("Stack.template.json", '{"Resources":{}}');
      await watchPause(400);

      // Then the stack it deploys is known to have changed
      assertStringEndsWith(changes.at(0) ?? "", "Stack.template.json");
    } finally {
      watcher.stop();
    }
  });

  it("watches a reported path the rules would otherwise skip", async () => {
    // Given a directory inside the working directory that watch normally skips
    const { directory, changes, watcher } = await watching();
    const mountedPath = directory.join("dist", "site");
    await directory.writeFile(["dist", "site", "index.html"], "<h1>a</h1>");
    watcher.addReported(mountedPath);
    await watchPause(200);

    try {
      // When the supervised process reported it and a file in it changes
      await directory.writeFile(["dist", "site", "index.html"], "<h1>b</h1>");
      await watchPause(400);

      // Then being told about it beats a default list of directories to skip
      assertStringStartsWith(changes.at(0) ?? "", mountedPath);
    } finally {
      watcher.stop();
    }
  });

  it("leaves a held path to the process that is answering it", async () => {
    // Given a template the supervised process both reported and is updating
    // its Stack from in place
    const { changes, watcher } = await watching();
    const synth = new TemporaryDirectory();
    await synth.resolvePath();
    await synth.writeFile("Stack.template.json", "{}");
    watcher.addReported(synth.join("Stack.template.json"));
    watcher.addHeld(synth.join("Stack.template.json"));
    await watchPause(200);

    try {
      // When it is synthesized again
      await synth.writeFile("Stack.template.json", '{"Resources":{}}');
      await watchPause(400);

      // Then nothing is restarted, and the in-place update is what answers it
      assertArrayEquals(changes, []);
    } finally {
      watcher.stop();
    }
  });

  it("takes a held path back when the run holding it has gone", async () => {
    // Given a template a run was answering itself
    const { changes, watcher } = await watching();
    const synth = new TemporaryDirectory();
    await synth.resolvePath();
    await synth.writeFile("Stack.template.json", "{}");
    watcher.addReported(synth.join("Stack.template.json"));
    watcher.addHeld(synth.join("Stack.template.json"));
    await watchPause(200);

    try {
      // When that run has gone, and the file changes before its replacement
      // says it is holding it too
      watcher.clearHeld();
      await synth.writeFile("Stack.template.json", '{"Resources":{}}');
      await watchPause(400);

      // Then the change is a restart again, rather than being left to a process
      // that is no longer there
      assertStringEndsWith(changes.at(0) ?? "", "Stack.template.json");
    } finally {
      watcher.stop();
    }
  });

  it("takes no notice of a path reported twice", async () => {
    // Given a reported directory
    const { watcher } = await watching();
    const mounted = new TemporaryDirectory();
    await mounted.resolvePath();

    try {
      // When the same path is reported again, as a second deploy does
      watcher.addReported(mounted.path());
      watcher.addReported(mounted.path());

      // Then nothing is watched twice, and nothing throws
    } finally {
      watcher.stop();
    }
  });

  it("takes no notice of a reported path that is not there", async () => {
    // Given a path the process named before anything wrote it
    const { watcher } = await watching();

    try {
      // When it is reported
      watcher.addReported(path.resolve("/nowhere/at/all"));

      // Then there is nothing to watch, and nothing throws
    } finally {
      watcher.stop();
    }
  });

  it("stops reporting once it has been stopped", async () => {
    // Given a watched working directory
    const { directory, changes, watcher } = await watching();
    watcher.stop();

    // When a file changes afterwards
    await directory.writeFile("handler.ts", "export const a = 1;");
    await watchPause(400);

    // Then nothing is reported to a supervisor that has finished
    assertArrayEquals(changes, []);
  });
});

interface Watching {
  readonly directory: TemporaryDirectory;
  readonly changes: string[];
  readonly changedAt: number[];
  readonly watcher: SimWatchWatcher;
}

interface WatchingProperties {
  readonly settleMs?: number;
}

async function watching(
  properties: WatchingProperties = {},
): Promise<Watching> {
  const { settleMs = 30 } = properties;
  const directory = new TemporaryDirectory();
  await directory.resolvePath();

  const changes: string[] = [];
  const changedAt: number[] = [];
  const watcher = new SimWatchWatcher({
    cwd: directory.path(),
    onChange: (changedPath: string): void => {
      changes.push(changedPath);
      changedAt.push(Date.now());
    },
    settleMs,
  });

  watcher.start();
  await watchPause(200);

  return { directory, changes, changedAt, watcher };
}

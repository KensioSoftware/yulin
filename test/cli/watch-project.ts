import { readFile } from "node:fs/promises";
import { TemporaryDirectory } from "../../src/util/filesystem/temporary-directory.js";

/**
 * How long one run of a supervised process is waited for.
 *
 * A run is a real process, spawned through `tsx`, importing whatever the dev
 * script imports. On a loaded CI runner that is seconds rather than the
 * fraction of one it takes on a developer machine, and the first spawn in a
 * file pays for a cold `tsx` transform cache on top of that. Twelve seconds
 * was not enough for it once the rest of the local suite grew. Two of these
 * fit inside the local test timeout, so a test that waited for a restart it
 * never got fails saying how many times the process ran rather than with a
 * bare timeout.
 */
export const watchRunTimeoutMs = 20_000;

/**
 * A throwaway project for `yulin watch` to supervise.
 *
 * Three directories, because two of them have to be outside the watched one.
 * The record of what ran cannot live in the project: writing it there would be
 * the supervised process changing a watched path, which is the restart loop
 * these tests also check for. Nor can the directory a run reports, which has to
 * be somewhere the working directory watch would not have reached anyway.
 */
export class WatchProject {
  private readonly project = new TemporaryDirectory();
  private readonly output = new TemporaryDirectory();
  private readonly mounted = new TemporaryDirectory();

  /**
   * Write the project's files and return it ready to be watched.
   */
  static async of(files: Record<string, string>): Promise<WatchProject> {
    const project = new WatchProject();

    await project.project.resolvePath();
    await project.output.resolvePath();
    await project.mounted.resolvePath();
    await project.mounted.writeFile("placeholder.txt", "");

    await Promise.all(
      Object.entries(files).map(async ([name, content]) =>
        project.write(name, content),
      ),
    );

    return project;
  }

  /**
   * The directory `yulin watch` runs in.
   */
  path(): string {
    return this.project.path();
  }

  /**
   * Where a run records that it happened, outside anything being watched.
   */
  runsLogPath(): string {
    return this.output.join("runs.log");
  }

  /**
   * A directory outside the project, standing in for one a run mounts into a
   * Bucket and reports.
   */
  mountedPath(): string {
    return this.mounted.path();
  }

  /**
   * Write a file in the project, as an editor saving would.
   */
  async write(name: string, content: string): Promise<void> {
    await this.project.writeFile(name, content);
  }

  /**
   * Write a file in the reported directory.
   */
  async writeMounted(name: string, content: string): Promise<void> {
    await this.mounted.writeFile(name, content);
  }

  /**
   * Wait for the filesystem to go quiet before the watching starts.
   *
   * macOS delivers events with a short delay, so a watch started immediately
   * after these files were written still sees them, and the first run would
   * restart for writes that happened before it existed.
   */
  async settled(): Promise<void> {
    await watchPause(250);
  }

  /**
   * What the supervised process recorded, one line per run.
   */
  async runs(): Promise<readonly string[]> {
    try {
      // oxlint-disable-next-line security/detect-non-literal-fs-filename
      const recorded = await readFile(this.runsLogPath(), "utf8");

      return recorded.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Wait until the supervised process has run a given number of times.
   */
  async untilRuns(
    count: number,
    withinMs = watchRunTimeoutMs,
  ): Promise<readonly string[]> {
    return await this.pollRuns(count, Date.now() + withinMs);
  }

  private async pollRuns(
    count: number,
    giveUpAt: number,
  ): Promise<readonly string[]> {
    const runs = await this.runs();

    if (runs.length >= count) {
      return runs;
    }

    if (Date.now() >= giveUpAt) {
      throw new Error(
        `Supervised process ran ${String(runs.length)} times, expected ${String(count)}`,
      );
    }

    await watchPause(25);

    return await this.pollRuns(count, giveUpAt);
  }
}

/**
 * A supervised script that records each run and then stays up.
 */
export function watchChildScript(runsLogPath: string): string {
  return String.raw`import { appendFileSync } from "node:fs";
import { message } from "./message.mjs";

appendFileSync(${JSON.stringify(runsLogPath)}, message + "\n");

setInterval(() => {}, 60_000);
`;
}

/**
 * A supervised script that names a directory to the supervisor over the same
 * channel Yulin's runtime uses, so it is watched without being listed.
 */
export function reportingChildScript(
  runsLogPath: string,
  reportedPath: string,
): string {
  return String.raw`import { appendFileSync } from "node:fs";

appendFileSync(${JSON.stringify(runsLogPath)}, "run\n");
process.send?.({ type: "yulin:watch-path", path: ${JSON.stringify(reportedPath)} });

setInterval(() => {}, 60_000);
`;
}

/**
 * A supervised script that writes into its own watched directory, which is the
 * mistake the restart loop guard is for.
 */
export function selfWritingChildScript(runsLogPath: string): string {
  return String.raw`import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";

appendFileSync(${JSON.stringify(runsLogPath)}, "run\n");
writeFileSync(path.join(process.cwd(), "generated.json"), JSON.stringify({ at: Date.now() }));

setInterval(() => {}, 60_000);
`;
}

/**
 * A supervised script that throws on startup, as a setup script with a mistake
 * in it does.
 */
export function throwingChildScript(runsLogPath: string): string {
  return String.raw`import { appendFileSync } from "node:fs";
import { message } from "./message.mjs";

appendFileSync(${JSON.stringify(runsLogPath)}, message + "\n");

if (message === "broken") {
  throw new Error("setup failed");
}

setInterval(() => {}, 60_000);
`;
}

/**
 * A supervised script that records whether a debugger could attach to it.
 */
export function inspectedChildScript(runsLogPath: string): string {
  return String.raw`import { appendFileSync } from "node:fs";
import inspector from "node:inspector";
import { message } from "./message.mjs";

appendFileSync(
  ${JSON.stringify(runsLogPath)},
  message + " " + (inspector.url() === undefined ? "no-inspector" : "inspector") + "\n",
);

setInterval(() => {}, 60_000);
`;
}

/**
 * Wait, for a test that has to let something not happen.
 */
export async function watchPause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

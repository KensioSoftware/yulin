import fs, { type FSWatcher } from "node:fs";
import path from "node:path";
import { simWatchConfig } from "../../watch/sim-watch.config.js";
import { SimWatchEventPath } from "./sim-watch-event-path.js";
import { SimWatchIgnore } from "./sim-watch-ignore.js";
import { SimWatchSettle } from "../../watch/sim-watch-settle.js";

interface SimWatchWatcherProperties {
  readonly cwd: string;
  readonly onChange: (changedPath: string) => void;
  readonly settleMs?: number | undefined;
}

/**
 * Watches the working directory, and whatever else the process says it is
 * reading.
 *
 * The working directory is watched whole and filtered down, rather than a list
 * of interesting paths being assembled up front, because the interesting paths
 * are whatever the project happens to import. What the process reports on top
 * of that is the paths Yulin holds but Node's module graph never mentions: a
 * directory mounted into a Bucket, and a synthesized template.
 *
 * A reported path is watched whether or not the ignore rules would have passed
 * over it. Being told about a path is more specific than a default list of
 * directories worth skipping.
 */
export class SimWatchWatcher {
  private readonly cwd: string;
  private readonly ignore = new SimWatchIgnore();
  private readonly settle: SimWatchSettle;
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly reportedRoots = new Set<string>();
  private readonly heldRoots = new Set<string>();

  constructor(properties: SimWatchWatcherProperties) {
    const { cwd, onChange, settleMs = simWatchConfig.settleMs } = properties;
    this.cwd = path.resolve(cwd);
    this.settle = new SimWatchSettle({
      settleMs,
      maxWaitMs: simWatchConfig.settleMaxWaitMs,
      onSettled: onChange,
    });
  }

  /**
   * Start watching the working directory.
   */
  start(): void {
    this.watch(this.cwd, true);
  }

  /**
   * Also watch a path the supervised process reported.
   *
   * A path inside the working directory is already covered by the recursive
   * watch, so it only needs recording as reported. One outside needs a watcher
   * of its own.
   */
  addReported(reportedPath: string): void {
    const resolved = path.resolve(reportedPath);

    if (this.reportedRoots.has(resolved)) {
      return;
    }

    this.reportedRoots.add(resolved);

    if (this.within(this.cwd, resolved)) {
      return;
    }

    this.watch(resolved, isDirectory(resolved));
  }

  /**
   * Leave a path to the process that reported it.
   *
   * A process watching a path itself answers a change to it without being
   * restarted, so restarting for it would throw away the simulated state that
   * answering in place exists to keep. This beats having reported the same path
   * for watching: being told a path is handled there is more specific than
   * being told it is worth watching here.
   */
  addHeld(heldPath: string): void {
    this.heldRoots.add(path.resolve(heldPath));
  }

  /**
   * Take back every held path, for a process that is no longer running.
   *
   * Held paths belong to the run that reported them, unlike reported paths,
   * which are only ever more to watch. A run that stopped holding a path, or
   * stopped altogether, would otherwise leave a file nothing is watching and
   * nothing restarts for.
   */
  clearHeld(): void {
    this.heldRoots.clear();
  }

  /**
   * Stop watching and drop any change that was still settling.
   */
  stop(): void {
    this.settle.cancel();

    for (const watcher of this.watchers.values()) {
      watcher.close();
    }

    this.watchers.clear();
  }

  private watch(target: string, recursive: boolean): void {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (this.watchers.has(target) || !fs.existsSync(target)) {
      return;
    }

    const eventPath = new SimWatchEventPath(target, recursive);

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const watcher = fs.watch(target, { recursive }, (_event, fileName) => {
      const changedPath = eventPath.of(fileName);

      if (changedPath !== undefined) {
        this.changed(changedPath);
      }
    });

    // A watched path can be deleted or replaced. Nothing useful can be done
    // about that from here, and a watcher with no error listener throws.
    /* v8 ignore next 4 -- raised where the platform reports a watch going away,
     * which macOS does not do for a deleted directory, so nothing here can make
     * it happen on the machine this suite runs on. */
    watcher.on("error", () => {
      watcher.close();
      this.watchers.delete(target);
    });

    this.watchers.set(target, watcher);
  }

  private changed(changedPath: string): void {
    if (this.ignored(changedPath)) {
      return;
    }

    this.settle.record(changedPath);
  }

  private ignored(changedPath: string): boolean {
    for (const root of this.heldRoots) {
      if (root === changedPath || this.within(root, changedPath)) {
        return true;
      }
    }

    for (const root of this.reportedRoots) {
      if (root === changedPath || this.within(root, changedPath)) {
        return false;
      }
    }

    return this.ignore.ignores(path.relative(this.cwd, changedPath));
  }

  private within(root: string, target: string): boolean {
    const relative = path.relative(root, target);

    return (
      relative.length > 0 &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative)
    );
  }
}

function isDirectory(target: string): boolean {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.statSync(target, { throwIfNoEntry: false })?.isDirectory() === true;
}

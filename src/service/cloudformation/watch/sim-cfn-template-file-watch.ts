import fs, { type FSWatcher } from "node:fs";
import path from "node:path";
import { SimWatchSettle } from "../../../watch/sim-watch-settle.js";
import {
  simWatch,
  type SimWatchRuntime,
} from "../../../watch/sim-watch-runtime.js";
import { simWatchConfig } from "../../../watch/sim-watch.config.js";

interface SimCfnTemplateFileWatchProperties {
  readonly templatePath: string;
  readonly onChanged: () => Promise<void>;
  readonly settleMs?: number | undefined;
  readonly watch?: SimWatchRuntime | undefined;
}

/**
 * Watches one deployed template file, and applies it again when it changes.
 *
 * The directory is what gets watched, not the file. A synthesis writes a
 * temporary file and renames it over the template, so a watch on the file
 * itself is left holding the file that was replaced. Events for anything else
 * in the directory, which for a cloud assembly is every other stack in it and
 * every staged asset, are dropped by name.
 *
 * Changes are applied one at a time. A save arriving while an update is still
 * running waits for it, rather than being refused as a second update of a Stack
 * that is already updating.
 */
export class SimCfnTemplateFileWatch {
  private readonly templatePath: string;
  private readonly onChanged: () => Promise<void>;
  private readonly settle: SimWatchSettle;
  private readonly watch: SimWatchRuntime;
  private watcher: FSWatcher | undefined;
  private applying: Promise<void> = Promise.resolve();

  constructor(properties: SimCfnTemplateFileWatchProperties) {
    const {
      templatePath,
      onChanged,
      settleMs = simWatchConfig.settleMs,
      watch = simWatch,
    } = properties;

    this.templatePath = path.resolve(templatePath);
    this.onChanged = onChanged;
    this.watch = watch;
    this.settle = new SimWatchSettle({
      settleMs,
      onSettled: (): void => {
        this.apply();
      },
    });
  }

  /**
   * Start watching.
   *
   * A `yulin watch` supervisor is told the path is handled here, so a
   * re-synthesis updates the Stack in place instead of restarting the process
   * and taking every simulated Bucket and Table with it.
   */
  start(): void {
    this.watch.reportHeldPath(this.templatePath);

    const directoryPath = path.dirname(this.templatePath);
    const templateFileName = path.basename(this.templatePath);

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const watcher = fs.watch(directoryPath, (_event, fileName) => {
      if (fileName === templateFileName) {
        this.settle.record(this.templatePath);
      }
    });

    // The directory can be deleted or replaced, and a watcher with no error
    // listener throws. Nothing here can put it back.
    /* v8 ignore next 4 -- raised where the platform reports a watch going away,
     * which macOS does not do for a deleted directory, so nothing here can make
     * it happen on the machine this suite runs on. */
    watcher.on("error", () => {
      watcher.close();
      this.watcher = undefined;
    });

    this.watcher = watcher;
  }

  /**
   * Stop watching, and drop a change that was still settling.
   */
  close(): void {
    this.settle.cancel();
    this.watcher?.close();
    this.watcher = undefined;
  }

  // Queued rather than started, so two saves in a row are two updates in order.
  // The change handler answers a failed update itself and never rejects, so the
  // queue cannot be left broken by one.
  private apply(): void {
    this.applying = this.applyAfter(this.applying);
  }

  private async applyAfter(applying: Promise<void>): Promise<void> {
    await applying;
    await this.onChanged();
  }
}

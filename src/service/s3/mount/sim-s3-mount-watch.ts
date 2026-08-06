import path from "node:path";
import {
  simWatch,
  type SimWatchRuntime,
} from "../../../watch/sim-watch-runtime.js";
import { SimWatchSettle } from "../../../watch/sim-watch-settle.js";
import { simWatchConfig } from "../../../watch/sim-watch.config.js";
import { SimS3MountDirectoryEvents } from "./sim-s3-mount-directory-events.js";

interface SimS3MountWatchProperties {
  readonly directoryPath: string;
  readonly onChanged: () => void;
  readonly settleMs?: number | undefined;
  readonly watch?: SimWatchRuntime | undefined;
}

/**
 * Watches one directory mounted into a Bucket, and answers a build in it.
 *
 * Nothing is copied when the directory changes, because the Bucket is already
 * reading the files. All that is left is telling the browser, once the writes
 * have stopped, so a build that wrote a hundred files is one reload.
 */
export class SimS3MountWatch {
  readonly directoryPath: string;

  private readonly onChanged: () => void;
  private readonly settle: SimWatchSettle;
  private readonly events: SimS3MountDirectoryEvents;
  private readonly watch: SimWatchRuntime;

  constructor(properties: SimS3MountWatchProperties) {
    const {
      directoryPath,
      onChanged,
      settleMs = simWatchConfig.settleMs,
      watch = simWatch,
    } = properties;

    this.directoryPath = path.resolve(directoryPath);
    this.onChanged = onChanged;
    this.watch = watch;
    this.settle = new SimWatchSettle({
      settleMs,
      onSettled: (): void => {
        this.onChanged();
      },
    });
    this.events = new SimS3MountDirectoryEvents({
      directoryPath: this.directoryPath,
      onEvent: (): void => {
        this.settle.record(this.directoryPath);
      },
    });
  }

  /**
   * Start watching.
   *
   * A `yulin watch` supervisor is told the directory is handled here, so a
   * rebuild reloads the page instead of restarting the process and taking every
   * simulated Bucket, Table and Stack with it.
   */
  start(): void {
    this.watch.reportHeldPath(this.directoryPath);
    this.events.start();
  }

  /**
   * Stop watching, and drop a change that was still settling.
   */
  close(): void {
    this.settle.cancel();
    this.events.close();
  }
}

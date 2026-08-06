import path from "node:path";
import { SimWatchSettle } from "../../../watch/sim-watch-settle.js";
import {
  simWatch,
  type SimWatchRuntime,
} from "../../../watch/sim-watch-runtime.js";
import { simWatchConfig } from "../../../watch/sim-watch.config.js";
import { SimCfnTemplateFileEvents } from "./sim-cfn-template-file-events.js";

interface SimCfnTemplateFileWatchProperties {
  readonly templatePath: string;
  readonly onChanged: () => Promise<void>;
  readonly settleMs?: number | undefined;
  readonly watch?: SimWatchRuntime | undefined;
}

/**
 * Watches one deployed template file, and applies it again when it changes.
 *
 * Changes are applied one at a time. A save arriving while an update is still
 * running waits for it, rather than being refused as a second update of a Stack
 * that is already updating.
 */
export class SimCfnTemplateFileWatch {
  private readonly templatePath: string;
  private readonly onChanged: () => Promise<void>;
  private readonly settle: SimWatchSettle;
  private readonly events: SimCfnTemplateFileEvents;
  private readonly watch: SimWatchRuntime;
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
    this.events = new SimCfnTemplateFileEvents({
      templatePath: this.templatePath,
      onEvent: (): void => {
        this.settle.record(this.templatePath);
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
    this.events.start();
  }

  /**
   * Stop watching, and drop a change that was still settling.
   */
  close(): void {
    this.settle.cancel();
    this.events.close();
  }

  // Queued rather than started, so two saves in a row are two updates in order.
  private apply(): void {
    this.applying = this.applyAfter(this.applying);
  }

  private async applyAfter(applying: Promise<void>): Promise<void> {
    await applying;

    try {
      await this.onChanged();
    } catch {
      // The change handler answers a failed update and a callback that threw
      // itself, so anything still thrown here is the watch failing rather than
      // the update. It is dropped because the queue has to survive it: a
      // rejected link in it would refuse every save after this one.
    }
  }
}

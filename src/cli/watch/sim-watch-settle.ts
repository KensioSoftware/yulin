interface SimWatchSettleProperties {
  readonly settleMs: number;
  readonly onSettled: (changedPath: string) => void;
}

/**
 * Turns a burst of writes into one change.
 *
 * Saving one file in an editor is several filesystem events: a temporary file
 * written, renamed over the original, and often the directory touched as well.
 * Restarting on each of those would be several restarts for one save, so the
 * changes are held until they stop arriving.
 *
 * The path reported is the first of the burst, which is the one that actually
 * changed rather than whatever the editor did around it.
 */
export class SimWatchSettle {
  private readonly settleMs: number;
  private readonly onSettled: (changedPath: string) => void;
  private pendingPath: string | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(properties: SimWatchSettleProperties) {
    const { settleMs, onSettled } = properties;
    this.settleMs = settleMs;
    this.onSettled = onSettled;
  }

  /**
   * Note a change, and wait to see whether more are coming.
   */
  record(changedPath: string): void {
    this.pendingPath ??= changedPath;
    const burstPath = this.pendingPath;

    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.pendingPath = undefined;
      this.onSettled(burstPath);
    }, this.settleMs);
  }

  /**
   * Drop anything waiting, for a watcher that is shutting down.
   */
  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pendingPath = undefined;
  }
}

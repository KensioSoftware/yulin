interface SimWatchSettleProperties {
  readonly settleMs: number;
  readonly maxWaitMs: number;
  readonly onSettled: (changedPath: string) => void;
}

/**
 * Turns a burst of writes into one change.
 *
 * Saving one file in an editor is several filesystem events: a temporary file
 * written, renamed over the original, and often the directory touched as well.
 * Acting on each of those would be several restarts, or several Stack updates,
 * for one save, so the changes are held until they stop arriving.
 *
 * A burst that never stops arriving would otherwise be held for as long as it
 * went on, since every event pushes the wait back. `maxWaitMs` is how long that
 * pushing back is allowed to last: a build that writes without a pause is acted
 * on during it rather than only once it finishes.
 *
 * The path reported is the first of the burst, which is the one that actually
 * changed rather than whatever the editor did around it.
 */
export class SimWatchSettle {
  private readonly settleMs: number;
  private readonly maxWaitMs: number;
  private readonly onSettled: (changedPath: string) => void;
  private pendingPath: string | undefined;
  private settleBy: number | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(properties: SimWatchSettleProperties) {
    const { settleMs, maxWaitMs, onSettled } = properties;
    this.settleMs = settleMs;
    // A maximum shorter than the window it caps would end every burst early,
    // including the one editor save the window is there for, so an unusually
    // long window is its own maximum.
    this.maxWaitMs = Math.max(maxWaitMs, settleMs);
    this.onSettled = onSettled;
  }

  /**
   * Note a change, and wait to see whether more are coming.
   */
  record(changedPath: string): void {
    this.pendingPath ??= changedPath;
    this.settleBy ??= Date.now() + this.maxWaitMs;
    const burstPath = this.pendingPath;

    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.pendingPath = undefined;
      this.settleBy = undefined;
      this.onSettled(burstPath);
    }, this.waitMs());
  }

  /**
   * Drop anything waiting, for a watcher that is shutting down.
   */
  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pendingPath = undefined;
    this.settleBy = undefined;
  }

  /**
   * How long to wait for the next event: the settle window, or whatever is left
   * of the maximum, whichever runs out first.
   */
  private waitMs(): number {
    const left = (this.settleBy ?? 0) - Date.now();

    return Math.max(0, Math.min(this.settleMs, left));
  }
}

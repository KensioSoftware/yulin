/**
 * Whether a mapping has finished polling, and the one place that says so.
 *
 * Two things finish a mapping. Deleting it stops the poller, and the cascade
 * guard refusing a chain of the function's own writes stops it too. A poll
 * reads one answer either way, and neither side has to know about the other.
 */
export class SimLambdaStreamHalt {
  private halted = false;

  /**
   * Whether polling has finished.
   */
  get stopped(): boolean {
    return this.halted;
  }

  /**
   * Finish polling.
   */
  stop(): void {
    this.halted = true;
  }
}

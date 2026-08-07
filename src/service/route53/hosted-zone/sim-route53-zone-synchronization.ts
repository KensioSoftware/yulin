import type { BackgroundScheduler } from "../../../util/background/background.js";

/**
 * The outstanding synchronization work for one simulated Hosted Zone.
 *
 * Route53 reports a zone as PENDING until its change has propagated, and a test
 * that wants the settled state waits for it. A zone can be changed again before
 * the previous change has finished, so this keeps one promise covering all of
 * them rather than only the most recent.
 */
export class SimRoute53ZoneSynchronization {
  #complete: Promise<void> | undefined;

  /**
   * Schedule synchronization work and remember its completion.
   */
  schedule(
    background: BackgroundScheduler,
    synchronize: () => Promise<void>,
  ): void {
    this.#complete = this.combined(this.scheduled(background, synchronize));
  }

  /**
   * Wait for every synchronization scheduled so far.
   */
  async waitForComplete(): Promise<void> {
    await this.#complete;
  }

  private scheduled(
    background: BackgroundScheduler,
    synchronize: () => Promise<void>,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      background.schedule(async () => {
        try {
          await synchronize();
          resolve();
        } catch (error) {
          /* v8 ignore start */
          reject(error instanceof Error ? error : new Error(String(error)));
          throw error;
          /* v8 ignore stop */
        }
      });
    });
  }

  private async combined(scheduled: Promise<void>): Promise<void> {
    await Promise.all([this.#complete, scheduled]);
  }
}

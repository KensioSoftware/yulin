import type {
  BackgroundCompleter,
  BackgroundScheduler,
  BackgroundTask,
} from "./background.js";

/* eslint-disable unicorn/prefer-await  */

/**
 * Non-deterministic async background tasks scheduler.
 *
 * Use this when you want to simulate asynchronous distributed operations
 * potentially completing out of sequence.
 */
export class NonDeterministicBackgroundTasks
  implements BackgroundScheduler, BackgroundCompleter
{
  private readonly pending = new Set<Promise<void>>();
  private readonly maxJitterMs: number;

  constructor(properties: { maxJitterMs?: number } = {}) {
    const { maxJitterMs = 5 } = properties;
    this.maxJitterMs = maxJitterMs;
  }

  /**
   * Wait at a non-deterministic sequencing point.
   */
  async sequence(): Promise<void> {
    await this.sleep(Math.random() * this.maxJitterMs);
  }

  /**
   * Schedule a task to happen asynchronously in the background.
   */
  schedule(task: BackgroundTask): void {
    const promise = this.sequence()
      .then(task)
      .then(
        () => {
          //
        },
        (error: unknown) => {
          // Keep the promise rejected so complete() can surface failures
          // deterministically.
          throw error;
        },
      )
      .finally(() => {
        this.pending.delete(promise);
      });

    this.pending.add(promise);
  }

  /**
   * Wait until all tasks currently scheduled have finished.
   * If tasks schedule more tasks, this will continue draining until idle.
   */
  public async complete(): Promise<void> {
    while (this.pending.size > 0) {
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.allSettled(this.pending);
      // Check if any promises rejected and capture the first error
      const firstRejected = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );

      if (firstRejected !== undefined) {
        throw firstRejected.reason;
      }
    }
  }

  /**
   * See how many outstanding background tasks are scheduled.
   */
  public get pendingTaskCount(): number {
    return this.pending.size;
  }

  private async sleep(ms = 0): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

export type BackgroundTask = () => Promise<void>;

export interface BackgroundScheduler {
  schedule(task: BackgroundTask): void;
}

export interface BackgroundCompleter {
  complete(): Promise<void>;
}

/**
 * Simple async background tasks scheduler, to simulate asynchronous distributed
 * operations occurring in a non-deterministic sequence.
 */
export class BackgroundTasks
  implements BackgroundScheduler, BackgroundCompleter
{
  private readonly pending = new Set<Promise<void>>();

  /**
   * Schedule a task to happen asynchronously in the background.
   */
  schedule(task: BackgroundTask): void {
    const promise = new Promise<void>((resolve) => {
      setTimeout(resolve, Math.random() * 3);
    })
      .then(task)
      .then(
        () => {
          //
        },
        (error: unknown) => {
          // Keep the promise rejected so drain() can surface failures
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
      await Promise.all(this.pending);
    }
  }

  /**
   * See how many outstanding background tasks are scheduled.
   */
  public get size(): number {
    return this.pending.size;
  }
}

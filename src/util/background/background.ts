export type BackgroundTask = () => Promise<void>;

export interface BackgroundScheduler {
  /**
   * Wait at a simulator sequencing point.
   *
   * The default implementation is deterministic and simply yields to the
   * microtask queue. Non-deterministic implementations may delay by a random
   * amount to simulate operations completing out of sequence.
   */
  sequence(): Promise<void>;

  schedule(task: BackgroundTask): void;
}

export interface BackgroundCompleter {
  complete(): Promise<void>;
}

/**
 * Deterministic async background tasks scheduler.
 *
 * Tasks still run asynchronously, outside the current call stack, but dispatch in
 * the order they were scheduled.
 */
export class BackgroundTasks
  implements BackgroundScheduler, BackgroundCompleter
{
  private readonly pending = new Set<Promise<void>>();

  /**
   * Wait at a deterministic sequencing point.
   */
  sequence(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Schedule a task to happen asynchronously in the background.
   */
  schedule(task: BackgroundTask): void {
    const promise = new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    })
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

/**
 * Non-deterministic async background tasks scheduler.
 *
 * Use this when you deliberately want to simulate asynchronous distributed
 * operations completing in a random order.
 */
export class NonDeterministicBackgroundTasks
  implements BackgroundScheduler, BackgroundCompleter
{
  private readonly pending = new Set<Promise<void>>();
  private readonly maxJitterMs: number;

  constructor(props: { maxJitterMs?: number } = {}) {
    const { maxJitterMs = 5 } = props;
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
      await Promise.all(this.pending);
    }
  }

  /**
   * See how many outstanding background tasks are scheduled.
   */
  public get size(): number {
    return this.pending.size;
  }

  private async sleep(ms = 0): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

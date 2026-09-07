import { AsyncLocalStorage } from "node:async_hooks";

/**
 * How many things one running scheduled task is waiting on the clock for.
 */
export interface BackgroundClockWait {
  count: number;
}

/**
 * Which scheduled tasks are waiting for the clock rather than for the host.
 *
 * Completing a simulation waits for the work that can still get somewhere on
 * its own. A task blocked on an instant the clock has not reached is not that
 * kind of work: only moving the clock releases it, and whatever moves the
 * clock is what waits for completion. Left in, it would be waiting for itself.
 *
 * A task says so for itself, from wherever inside it the wait happens, so a
 * scheduler needs no way of telling one kind of work from another. Code
 * running outside a scheduled task has nothing to say, and changes nothing by
 * saying it, which is what keeps this invisible to a caller who holds the
 * promise itself.
 */
export class BackgroundClockWaits {
  private readonly storage = new AsyncLocalStorage<BackgroundClockWait>();
  private started = Promise.withResolvers<undefined>();

  /**
   * Run outstanding work with a record of what it waits on the clock for.
   */
  async around<T>(
    wait: BackgroundClockWait,
    work: () => Promise<T>,
  ): Promise<T> {
    return await this.storage.run(wait, work);
  }

  /**
   * The work in a set that completion has anything to wait for.
   *
   * The work asking is always left out. Waiting for the invocation the asking
   * code is part of would be waiting for itself.
   *
   * Work waiting on the clock is left out where simulated time stands still,
   * since only a caller moving the clock brings the instant it waits for, and
   * that caller is the one waiting here. A running clock reaches the instant on
   * its own, and this waits for the work to get there.
   */
  runnable(
    held: ReadonlyMap<Promise<unknown>, BackgroundClockWait>,
    clockIsRunning = false,
  ): Promise<unknown>[] {
    const own = this.storage.getStore();

    return held
      .entries()
      .filter(
        ([, wait]) => wait !== own && (clockIsRunning || wait.count === 0),
      )
      .map(([promise]) => promise)
      .toArray();
  }

  /**
   * Whether the code running now is already inside outstanding work, and so
   * already counted.
   */
  get inWork(): boolean {
    return this.storage.getStore() !== undefined;
  }

  /**
   * Say that the task running now is waiting for simulated time to reach an
   * instant, and get back the way to say it no longer is.
   */
  begin(): () => void {
    const wait = this.storage.getStore();

    if (wait === undefined) {
      return (): void => {
        // Nothing scheduled is waiting, so nothing stops waiting either.
      };
    }

    wait.count += 1;
    this.wake();

    return (): void => {
      wait.count -= 1;
    };
  }

  /**
   * Resolves the next time a task starts waiting on the clock.
   *
   * Whoever is waiting for the simulation to complete takes this alongside the
   * tasks it is waiting for, so a task that parks part way through stops the
   * wait rather than extending it forever.
   */
  get next(): Promise<undefined> {
    return this.started.promise;
  }

  private wake(): void {
    const { resolve } = this.started;

    this.started = Promise.withResolvers<undefined>();
    resolve(undefined);
  }
}

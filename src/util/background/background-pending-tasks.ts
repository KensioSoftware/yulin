import type { BackgroundTask } from "./background.js";
import { BackgroundSettledTasks } from "./background-settled-tasks.js";
import {
  type BackgroundClockWait,
  BackgroundClockWaits,
} from "./background-clock-waits.js";

/**
 * The work one scheduler has outstanding, and how much of it is worth waiting
 * for.
 *
 * Work gets here two ways. A task the scheduler was handed is held here until
 * it settles, and its failure is kept for whoever waits for the simulation to
 * complete. Work a caller started is held here too, but answers to that caller
 * instead, because reporting the same failure twice would fail somebody who
 * never asked for the work.
 *
 * Either way, what completion waits for is what can still get somewhere on its
 * own. Work waiting on the clock cannot, and neither can the work asking for
 * the simulation to settle.
 */
export class BackgroundPendingTasks {
  readonly #held = new Map<Promise<unknown>, BackgroundClockWait>();
  readonly #clockWaits = new BackgroundClockWaits();

  /**
   * Hold a task until it settles, keeping how it settled for whoever waits.
   */
  hold(task: BackgroundTask): void {
    const wait: BackgroundClockWait = { count: 0 };

    this.#keep(wait, this.#clockWaits.around(wait, task));
  }

  /**
   * Hold work a caller started, answering with what it settles with.
   *
   * Work already running inside a held task is counted where it is, and simply
   * runs.
   */
  async holdCallers<T>(work: () => Promise<T>): Promise<T> {
    if (this.#clockWaits.inWork) {
      return await work();
    }

    const wait: BackgroundClockWait = { count: 0 };
    const answer = this.#clockWaits.around(wait, work);

    this.#keep(wait, ignoringFailure(answer));

    return await answer;
  }

  /**
   * Say that the held task running now is waiting on the clock.
   */
  waitingOnClock(): () => void {
    return this.#clockWaits.begin();
  }

  /**
   * How much work is outstanding, whatever it is waiting for.
   */
  get size(): number {
    return this.#held.size;
  }

  /**
   * Wait until nothing is outstanding but work that is waiting on the clock.
   *
   * Work that parks part way through ends the wait rather than extending it:
   * only moving the clock releases it, and moving the clock is what waits
   * here. The loop then looks again at what is left running, so work that
   * carries on is waited for again.
   */
  async complete(): Promise<void> {
    let running = this.running();

    while (running.length > 0) {
      // oxlint-disable-next-line no-await-in-loop
      const settled = await Promise.race([
        Promise.allSettled(running),
        this.#clockWaits.next,
      ]);

      new BackgroundSettledTasks(settled).throwFirstFailure();

      running = this.running();
    }
  }

  /**
   * The work completion has anything to wait for, which is whatever is
   * neither waiting on the clock nor waiting for completion itself.
   *
   * Work that asks for the simulation to settle from inside itself is left
   * out. A handler advancing the clock is the ordinary case, and waiting for
   * the invocation it is part of would be waiting for itself.
   */
  running(): Promise<unknown>[] {
    return this.#clockWaits.runnable(this.#held);
  }

  /**
   * Keep work outstanding under its own record until it settles.
   */
  #keep(wait: BackgroundClockWait, work: Promise<unknown>): void {
    const promise = settling(work, () => {
      this.#held.delete(promise);
    });

    this.#held.set(promise, wait);
  }
}

/**
 * Answer for work, letting go of it once it has settled either way.
 */
async function settling(
  work: Promise<unknown>,
  settled: () => void,
): Promise<unknown> {
  try {
    return await work;
  } finally {
    settled();
  }
}

/**
 * Wait for work without taking on how it failed, which the caller holding it
 * is told about instead.
 */
async function ignoringFailure(work: Promise<unknown>): Promise<void> {
  try {
    await work;
  } catch {
    // Reported to the caller, not to whoever waits for completion.
  }
}

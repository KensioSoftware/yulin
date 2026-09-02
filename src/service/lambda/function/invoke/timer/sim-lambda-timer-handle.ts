/**
 * What a handler passes to `setTimeout` or `setInterval` to be run later.
 */
export type SimLambdaTimerCallback = (...arguments_: unknown[]) => void;

/**
 * Timer functions of the shape the Node.js runtime gives handler code.
 */
export interface SimLambdaTimers {
  setTimeout(
    callback: SimLambdaTimerCallback,
    delay?: number,
    ...arguments_: unknown[]
  ): SimLambdaTimerHandle | NodeJS.Timeout;

  setInterval(
    callback: SimLambdaTimerCallback,
    delay?: number,
    ...arguments_: unknown[]
  ): SimLambdaTimerHandle | NodeJS.Timeout;
}

/**
 * Where a timer goes to be given up, which is the set it was made in.
 */
export interface SimLambdaTimerOwner {
  clear(handle: SimLambdaTimerHandle): void;
}

/**
 * The handle a handler gets back from `setTimeout` or `setInterval`.
 *
 * Real timer functions answer with an object rather than a number, and the
 * only thing handler code usually does with it is hand it back to
 * `clearTimeout`. It carries the set it belongs to, so clearing it reaches
 * that set rather than whichever invocation happens to be running.
 *
 * Referencing is answered because a handler is free to ask. A simulated timer
 * is unreferenced already: it waits on a clock a test moves, and holds nothing
 * open whatever it is asked.
 */
export class SimLambdaTimerHandle {
  readonly #owner: SimLambdaTimerOwner;

  constructor(owner: SimLambdaTimerOwner) {
    this.#owner = owner;
  }

  /**
   * Give up this timer, as `clearTimeout` and `clearInterval` do.
   */
  cancel(): void {
    this.#owner.clear(this);
  }

  /**
   * Keep the simulation open for this timer, which it already is.
   */
  ref(): this {
    return this;
  }

  /**
   * Stop keeping the simulation open for this timer, which it never was.
   */
  unref(): this {
    return this;
  }

  /**
   * Whether this timer holds the process open, which a simulated one never
   * does.
   */
  hasRef(): boolean {
    return false;
  }
}

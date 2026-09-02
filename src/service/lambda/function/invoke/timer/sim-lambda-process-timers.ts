import { AsyncLocalStorage } from "node:async_hooks";
import {
  simLambdaClearInterval,
  simLambdaClearTimeout,
} from "./sim-lambda-clear-timer.js";
import { simLambdaHostTimers } from "./sim-lambda-host-timers.js";
import { defineSimLambdaTimer } from "./sim-lambda-timer-global.js";
import type { SimLambdaInvocationTimers } from "./sim-lambda-invocation-timers.js";
import type {
  SimLambdaTimerCallback,
  SimLambdaTimerHandle,
  SimLambdaTimers,
} from "./sim-lambda-timer-handle.js";

/**
 * The timer functions the code running now should be using.
 *
 * A handler function reference is a closure over its own module scope, so it
 * reaches for the same global `setTimeout` as every other line in the test
 * run. Zip code has a sandbox of its own and is given these directly. Both
 * paths end up here, and both find the invocation that is running now through
 * Node.js asynchronous context tracking, exactly as the substitute Date does.
 *
 * Outside an invocation there is nothing to find, and the host's own timers
 * answer instead. That is what keeps the substitutes inert for a test run's
 * own timers, for a test framework's, and for one simulation while another is
 * running an invocation.
 */
class SimLambdaProcessTimers {
  private readonly storage = new AsyncLocalStorage<SimLambdaInvocationTimers>();
  private installed = false;

  /**
   * Run an invocation with timers of its own.
   */
  async run<T>(
    timers: SimLambdaInvocationTimers,
    run: () => Promise<T>,
  ): Promise<T> {
    return await this.storage.run(timers, run);
  }

  /**
   * The timers the code running now should use.
   */
  current(): SimLambdaTimers {
    return this.storage.getStore() ?? simLambdaHostTimers;
  }

  /**
   * Replace the global timer functions with ones that follow the store.
   *
   * Installed on the first invocation of host-scope code rather than at
   * import, so a test run that never invokes one is left completely alone.
   * Sandboxed code needs none of this: its own globals are built for it, and
   * they are given the same substitutes directly.
   *
   * With no invocation running the substitutes call the host functions and
   * answer with what they answer, so an installed patch behaves exactly like
   * no patch at all. They are never removed, because removing one would be
   * unsafe while another invocation is in flight and there is nothing to gain.
   */
  install(): void {
    if (this.installed) {
      return;
    }

    this.installed = true;
    defineSimLambdaTimer("setTimeout", simLambdaSetTimeout);
    defineSimLambdaTimer("clearTimeout", simLambdaClearTimeout);
    defineSimLambdaTimer("setInterval", simLambdaSetInterval);
    defineSimLambdaTimer("clearInterval", simLambdaClearInterval);
  }
}

/**
 * Shared because it patches process globals: one patch, one store.
 */
export const simLambdaProcessTimers = new SimLambdaProcessTimers();

/**
 * Run a callback once a delay has passed, on the clock of the invocation
 * running now.
 */
export function simLambdaSetTimeout(
  callback: SimLambdaTimerCallback,
  delay?: number,
  ...arguments_: unknown[]
): SimLambdaTimerHandle | NodeJS.Timeout {
  return simLambdaProcessTimers
    .current()
    .setTimeout(callback, delay, ...arguments_);
}

/**
 * Run a callback every time a delay passes, on the clock of the invocation
 * running now.
 */
export function simLambdaSetInterval(
  callback: SimLambdaTimerCallback,
  delay?: number,
  ...arguments_: unknown[]
): SimLambdaTimerHandle | NodeJS.Timeout {
  return simLambdaProcessTimers
    .current()
    .setInterval(callback, delay, ...arguments_);
}

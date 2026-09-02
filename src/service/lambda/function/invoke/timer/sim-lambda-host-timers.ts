import {
  setInterval as hostSetInterval,
  setTimeout as hostSetTimeout,
} from "node:timers";
import type {
  SimLambdaTimerCallback,
  SimLambdaTimers,
} from "./sim-lambda-timer-handle.js";

/**
 * The timers code outside a sim Lambda invocation gets, which are the host's
 * own.
 *
 * A test run's own timers, a test framework's, and one simulation's while
 * another is running an invocation all come through here, so the substitutes
 * installed over the globals behave exactly as the globals they replaced.
 */
class SimLambdaHostTimers implements SimLambdaTimers {
  /**
   * Run a callback once a delay of real time has passed.
   */
  setTimeout(
    callback: SimLambdaTimerCallback,
    delay?: number,
    ...arguments_: unknown[]
  ): NodeJS.Timeout {
    return hostSetTimeout(callback, delay, ...(arguments_ as []));
  }

  /**
   * Run a callback every time a delay of real time passes.
   */
  setInterval(
    callback: SimLambdaTimerCallback,
    delay?: number,
    ...arguments_: unknown[]
  ): NodeJS.Timeout {
    return hostSetInterval(callback, delay, ...(arguments_ as []));
  }
}

/**
 * Shared because it holds nothing: every caller wants the same host timers.
 */
export const simLambdaHostTimers = new SimLambdaHostTimers();

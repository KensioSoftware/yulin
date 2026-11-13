import { syncBuiltinESMExports } from "node:module";
import timers from "node:timers";
import timersPromises from "node:timers/promises";
import { promisify } from "node:util";

import {
  simLambdaClearInterval,
  simLambdaClearTimeout,
} from "./sim-lambda-clear-timer.js";
import {
  simLambdaSetInterval,
  simLambdaSetTimeout,
} from "./sim-lambda-process-timers.js";
import {
  simLambdaSchedulerWait,
  simLambdaSetTimeoutPromise,
} from "./sim-lambda-timer-promises.js";

/**
 * The specifiers the timer modules are required by.
 */
const timerModuleSpecifiers = new Set([
  "timers",
  "node:timers",
  "timers/promises",
  "node:timers/promises",
]);

/**
 * Whether a specifier names one of the timer modules this patch replaces
 * functions on.
 */
export function simLambdaIsTimerModule(specifier: string): boolean {
  return timerModuleSpecifiers.has(specifier);
}

/**
 * Replace the timer functions on `node:timers` and `node:timers/promises`
 * with ones on the clock of the invocation running now.
 *
 * The modules are what code holds when it imports a timer by name rather than
 * reading the global, so the functions are replaced on them in place, and the
 * built-in modules' named ES module exports re-synchronised afterwards. The
 * replaced `setTimeout` answers `util.promisify` with the promise form on the
 * same clock.
 *
 * Outside an invocation every replacement falls back to the host's own
 * timers, so the patch is inert for everything else in the process. It is
 * installed once and never removed, as the global timers are.
 */
export function installSimLambdaTimerModules(): void {
  if (timers.setTimeout === simLambdaSetTimeout) {
    return;
  }

  Object.defineProperty(simLambdaSetTimeout, promisify.custom, {
    configurable: true,
    value: simLambdaSetTimeoutPromise,
  });

  const patched = timers as unknown as Record<string, unknown>;
  patched["setTimeout"] = simLambdaSetTimeout;
  patched["clearTimeout"] = simLambdaClearTimeout;
  patched["setInterval"] = simLambdaSetInterval;
  patched["clearInterval"] = simLambdaClearInterval;

  const patchedPromises = timersPromises as unknown as Record<string, unknown>;
  patchedPromises["setTimeout"] = simLambdaSetTimeoutPromise;
  (timersPromises.scheduler as unknown as Record<string, unknown>)["wait"] =
    simLambdaSchedulerWait;

  syncBuiltinESMExports();
}

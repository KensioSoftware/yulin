import { hostSetTimeoutPromise } from "../../../../../util/timer/host-timers.js";
import { simLambdaClearTimeout } from "./sim-lambda-clear-timer.js";
import {
  simLambdaProcessTimers,
  simLambdaSetTimeout,
} from "./sim-lambda-process-timers.js";

interface SimLambdaTimerPromiseOptions {
  readonly signal?: AbortSignal | undefined;
  readonly ref?: boolean | undefined;
}

/**
 * The error a promise timer rejects with once its signal aborts, shaped as the
 * one Node.js rejects with.
 */
class SimLambdaTimerAbortError extends Error {
  override readonly name = "AbortError";
  readonly code = "ABORT_ERR";

  constructor(signal: AbortSignal | undefined) {
    super("The operation was aborted", { cause: signal?.reason });
  }
}

/**
 * Resolve with a value once a delay has passed, on the clock of the invocation
 * running now, as `setTimeout` from `node:timers/promises` does.
 *
 * An abort signal rejects the promise and cancels the timer, the way the
 * Node.js promise timer does. Outside an invocation the host's own promise
 * timer answers, `ref` option and all.
 */
export async function simLambdaSetTimeoutPromise<T = void>(
  delay?: number,
  value?: T,
  options?: SimLambdaTimerPromiseOptions,
): Promise<T> {
  if (!simLambdaProcessTimers.running()) {
    return await hostSetTimeoutPromise(delay, value as T, options);
  }

  const signal = options?.signal;

  if (signal?.aborted === true) {
    throw new SimLambdaTimerAbortError(signal);
  }

  return await new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      simLambdaClearTimeout(handle);
      reject(new SimLambdaTimerAbortError(signal));
    };
    const handle = simLambdaSetTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(value as T);
    }, delay);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Wait for a delay on the clock of the invocation running now, as
 * `scheduler.wait` from `node:timers/promises` does.
 */
export async function simLambdaSchedulerWait(
  delay?: number,
  options?: SimLambdaTimerPromiseOptions,
): Promise<void> {
  await simLambdaSetTimeoutPromise(delay, undefined, options);
}

import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import { simLambdaRetryDueTime } from "../../../function/event-invoke/sim-lambda-event-invoke-settings.js";
import type { SimLambdaAsyncInvocationSettings } from "./sim-lambda-async-invocation-settings.js";
import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";
import {
  simLambdaGivenUpAtOnce,
  type SimLambdaHandlerAttempt,
} from "./sim-lambda-handler-attempt.js";

/**
 * The longest real Lambda waits between tries of a throttled event, five
 * minutes.
 */
const longestThrottleWaitSeconds = 300;

/**
 * The attempts one asynchronous invocation has made, and when the next one
 * falls due.
 *
 * A handler that ran and failed is retried as `MaximumRetryAttempts` allows,
 * about a minute and then two minutes later. A throttled attempt never ran,
 * so it spends none of those retries: real Lambda tries it again after a
 * second, then two, doubling up to five minutes, until the event is too old.
 * An invocation stopped for running in a recursive loop, and one for a
 * function with no concurrency reserved at all, are not tried again.
 */
export class SimLambdaAsyncAttempts {
  /** How many attempts ran the handler. */
  count = 0;

  #throttles = 0;
  readonly #simFunction: SimLambdaFunction;
  readonly #settings: SimLambdaAsyncInvocationSettings;
  readonly #background: BackgroundScheduler;

  constructor(properties: {
    readonly simFunction: SimLambdaFunction;
    readonly settings: SimLambdaAsyncInvocationSettings;
    readonly background: BackgroundScheduler;
  }) {
    this.#simFunction = properties.simFunction;
    this.#settings = properties.settings;
    this.#background = properties.background;
  }

  /**
   * When an attempt that failed is made again, or nothing when the
   * invocation is given up.
   */
  nextAfter(
    attempt: Extract<SimLambdaHandlerAttempt, { succeeded: false }>,
  ): Date | undefined {
    const now = this.#background.now();

    if (!attempt.throttled) {
      this.count += 1;

      return this.count > this.#settings.maximumRetryAttempts
        ? undefined
        : simLambdaRetryDueTime(now, this.count);
    }

    if (simLambdaGivenUpAtOnce(attempt.error, this.#simFunction)) {
      return undefined;
    }

    const seconds = Math.min(2 ** this.#throttles, longestThrottleWaitSeconds);
    this.#throttles += 1;

    return new Date(now.getTime() + seconds * 1000);
  }
}

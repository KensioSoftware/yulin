import { SimLambdaTooManyRequestsException } from "../../error/sim-lambda.error.js";
import type { SimLambdaFunctionMetrics } from "../../metric/sim-lambda-function-metrics.js";

/**
 * The reserved concurrency of one simulated Lambda function, and the
 * invocations of it running now.
 *
 * Reserved concurrency belongs to the function as a whole, so a version
 * published from the function shares this object with it, and every
 * invocation of either counts against the same limit. A function with none
 * reserved scales without one here, where real Lambda would stop at the
 * account's unreserved capacity.
 */
export class SimLambdaFunctionConcurrency {
  #reserved: number | undefined;
  #running = 0;
  #refusals = 0;

  /**
   * How many invocations the reservation has turned away so far.
   *
   * The refusal happens synchronously as an invocation starts, so a caller
   * reading this before and after starting one can tell whether that very
   * invocation was turned away, apart from a throttle the handler met while
   * invoking something else.
   */
  get refusals(): number {
    return this.#refusals;
  }

  /**
   * The number of simultaneous invocations reserved for the function, if any
   * are.
   */
  get reserved(): number | undefined {
    return this.#reserved;
  }

  /**
   * Reserve concurrency for the function, or remove the reservation.
   */
  reserve(reserved: number | undefined): void {
    this.#reserved = reserved;
  }

  /**
   * Run one invocation of the function, throttling it as real Lambda does when
   * the reserved concurrency is already in use. Zero reserved throttles every
   * invocation, which is how a function is switched off.
   *
   * A throttled invocation never starts, so it counts as a throttle and not as
   * an invocation or an error.
   */
  async run<T>(
    metrics: SimLambdaFunctionMetrics,
    functionName: string,
    run: () => Promise<T>,
  ): Promise<T> {
    if (this.#reserved !== undefined && this.#running >= this.#reserved) {
      this.#refusals += 1;
      metrics.throttled(functionName);

      throw new SimLambdaTooManyRequestsException("Rate Exceeded.", {
        reason: "ReservedFunctionConcurrentInvocationLimitExceeded",
      });
    }

    this.#running += 1;

    try {
      return await metrics.around(functionName, run);
    } finally {
      this.#running -= 1;
    }
  }
}

/**
 * The `Concurrency` GetFunction reports, for a function with a reservation.
 */
export function simLambdaGetFunctionConcurrency(
  concurrency: SimLambdaFunctionConcurrency,
): { Concurrency?: { ReservedConcurrentExecutions: number } } {
  const reserved = concurrency.reserved;

  return reserved === undefined
    ? {}
    : { Concurrency: { ReservedConcurrentExecutions: reserved } };
}

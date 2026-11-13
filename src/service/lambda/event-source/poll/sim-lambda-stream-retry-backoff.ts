/**
 * The longest wait, in seconds, the simulation's clock can be scheduled at.
 *
 * A `Date` holds about 275,000 years either side of the epoch, and a wait past
 * that would be scheduled at an instant that is not a date at all. Doubling
 * reaches it on the 44th attempt, which is further than any test can advance
 * the clock, so this is a guard on the arithmetic rather than a wait a mapping
 * meets.
 */
const longestWaitSeconds = 2 ** 42;

/**
 * Where the number of attempts a failed batch gets is read from.
 */
export interface SimLambdaStreamAttemptLimit {
  readonly attemptLimit: number;
}

/**
 * How long a mapping waits before handing a failed batch to its function
 * again, and how many waits it has left.
 *
 * The delay is a simulator constraint rather than AWS behaviour, and it is
 * deliberate. AWS documents no delay between attempts. A delay of zero here
 * would be scheduled at the instant the clock already reads, and advancing the
 * clock keeps dispatching whatever falls due inside the interval it is moving
 * through, so a batch the function always throws on would leave `advanceBy`
 * with work to do forever. The delay is therefore strictly positive and grows
 * with each attempt, which is also what a consumer under load actually wants,
 * and it is what lets a test walk through the attempts by advancing the clock.
 *
 * How many attempts there are belongs to the mapping rather than to this: a
 * mapping that asked for a retry quota gets the quota it asked for, and one
 * that asked for neither limit gets the simulator's own cap.
 */
export class SimLambdaStreamRetryBackoff {
  private readonly limits: SimLambdaStreamAttemptLimit;
  private attempts = 0;

  /**
   * The limit is read on every attempt, so an update to the mapping's retry
   * quota applies to a batch already being retried.
   */
  constructor(limits: SimLambdaStreamAttemptLimit) {
    this.limits = limits;
  }

  /**
   * Whether the batch has failed at least once and is being tried again.
   */
  get isRetrying(): boolean {
    return this.attempts > 0;
  }

  /**
   * Whether this batch has had all the attempts it gets.
   */
  get isExhausted(): boolean {
    return this.attempts >= this.limits.attemptLimit;
  }

  /**
   * How long to wait before the next attempt, in seconds.
   */
  nextSeconds(): number {
    this.attempts += 1;

    return Math.min(2 ** (this.attempts - 1), longestWaitSeconds);
  }

  /**
   * Start counting again, which a batch that is finished with does.
   */
  reset(): void {
    this.attempts = 0;
  }
}

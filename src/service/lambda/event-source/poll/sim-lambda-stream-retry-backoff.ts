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
  private readonly attemptLimit: number;
  private attempts = 0;

  constructor(attemptLimit: number) {
    this.attemptLimit = attemptLimit;
  }

  /**
   * Whether this batch has had all the attempts it gets.
   */
  get isExhausted(): boolean {
    return this.attempts >= this.attemptLimit;
  }

  /**
   * How long to wait before the next attempt, in seconds.
   */
  nextSeconds(): number {
    this.attempts += 1;

    return 2 ** (this.attempts - 1);
  }

  /**
   * Start counting again, which a batch that is finished with does.
   */
  reset(): void {
    this.attempts = 0;
  }
}

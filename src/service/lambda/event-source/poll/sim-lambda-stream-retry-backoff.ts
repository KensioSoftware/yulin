/**
 * How many times one batch is delivered again before it is given up on.
 */
const attemptLimit = 5;

/**
 * How long a mapping waits before handing a failed batch to its function
 * again, and when it stops trying.
 *
 * Both are simulator constraints rather than AWS behaviour, and both are
 * deliberate.
 *
 * AWS documents no delay between attempts. A delay of zero here would be
 * scheduled at the instant the clock already reads, and advancing the clock
 * keeps dispatching whatever falls due inside the interval it is moving
 * through, so a batch the function always throws on would leave `advanceBy`
 * with work to do forever. The delay is therefore strictly positive and grows
 * with each attempt, which is also what a consumer under load actually wants.
 *
 * AWS retries a stream batch until the records age out of the stream, which is
 * a day. Waiting out a simulated day for a handler that is never going to
 * succeed is the same hang with more steps, so the attempts are counted
 * instead. What happens at the end is AWS's own behaviour: the records are
 * discarded and the mapping carries on with the stream.
 */
export class SimLambdaStreamRetryBackoff {
  private attempts = 0;

  /**
   * Whether this batch has had all the attempts it gets.
   */
  get isExhausted(): boolean {
    return this.attempts >= attemptLimit;
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

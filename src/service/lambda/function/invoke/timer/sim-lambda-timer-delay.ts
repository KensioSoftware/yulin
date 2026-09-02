/**
 * The delay a timer waits, in whole milliseconds of simulated time.
 *
 * A delay that is missing, negative or not a number is no delay at all, which
 * leaves the timer due at the instant it was asked for. Node.js rounds those
 * up to a millisecond of host time; simulated time has nothing to round up to,
 * and a handler yielding with `setTimeout(resolve, 0)` should not need a test
 * to move the clock before it gets going again.
 */
export function simLambdaTimerDelay(delay: number | undefined): number {
  if (delay === undefined || !Number.isFinite(delay)) {
    return 0;
  }

  return Math.max(Math.trunc(delay), 0);
}

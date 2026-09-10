/**
 * A timer one invocation is waiting on, and the instant it comes due.
 */
export interface SimLambdaPendingTimer {
  /** The delay the code under test asked for, in milliseconds. */
  readonly delay: number;

  /** The simulated instant the timer's work runs at. */
  readonly dueTime: Date;
}

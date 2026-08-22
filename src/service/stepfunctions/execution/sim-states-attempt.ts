/**
 * One run of one state, as an execution made it.
 *
 * A state a `Retry` ran again appears once per attempt, in the order the
 * attempts were made, so a test can count how many times a task ran and read
 * what each run failed with.
 */
export interface SimStatesAttempt {
  readonly stateName: string;

  /**
   * The Amazon States Language error name the attempt failed with, where it
   * failed. An attempt that did its work carries none.
   */
  readonly error?: string;
}

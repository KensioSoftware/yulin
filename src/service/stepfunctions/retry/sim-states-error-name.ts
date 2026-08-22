/**
 * The name that matches whatever a state failed with.
 */
export const simStatesAllErrors = "States.ALL";

/**
 * The failure a task runs past its `TimeoutSeconds` or `HeartbeatSeconds` with.
 */
export const simStatesTimeoutError = "States.Timeout";

/**
 * The failure a state that could not run on the data it was given ends with.
 *
 * Real Step Functions neither retries nor catches this one, whatever a retrier
 * names, and neither does this.
 */
export const simStatesRuntimeError = "States.Runtime";

/**
 * Whether one retrier's or catcher's `ErrorEquals` names an error.
 *
 * Amazon States Language matches on the error name alone, so a catcher naming
 * `States.TaskFailed` catches a task that failed and leaves everything else to
 * the catcher after it. `States.ALL` matches anything, apart from the one error
 * nothing matches.
 */
export function simStatesErrorMatches(
  errorEquals: readonly string[],
  error: string,
): boolean {
  if (error === simStatesRuntimeError) {
    return false;
  }

  return errorEquals.some(
    (named) => named === simStatesAllErrors || named === error,
  );
}

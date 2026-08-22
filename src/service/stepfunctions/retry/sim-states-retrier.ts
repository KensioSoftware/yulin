/**
 * One entry in a state's `Retry`.
 *
 * The four fields that shape the wait are optional, and the defaults below are
 * the ones Amazon States Language gives them.
 */
export interface SimStatesRetrier {
  readonly ErrorEquals: readonly string[];
  readonly IntervalSeconds?: number;
  readonly MaxAttempts?: number;
  readonly BackoffRate?: number;
  readonly MaxDelaySeconds?: number;
}

/**
 * What a retrier means where it says nothing.
 *
 * `MaxAttempts` counts retries rather than runs, so the default lets a task run
 * four times: once, and then three more.
 */
export const simStatesRetryIntervalSeconds = 1;
export const simStatesRetryMaxAttempts = 3;
export const simStatesRetryBackoffRate = 2;

/**
 * How many retries one retrier allows.
 */
export function simStatesRetriesAllowed(retrier: SimStatesRetrier): number {
  return retrier.MaxAttempts ?? simStatesRetryMaxAttempts;
}

/**
 * How long to wait before the next retry this retrier takes.
 *
 * The wait grows by `BackoffRate` for each retry already taken, so the first
 * one waits `IntervalSeconds` and each one after it waits longer.
 * `MaxDelaySeconds` caps how long that can get.
 */
export function simStatesRetryDelaySeconds(
  retrier: SimStatesRetrier,
  taken: number,
): number {
  const interval = retrier.IntervalSeconds ?? simStatesRetryIntervalSeconds;
  const backoff = retrier.BackoffRate ?? simStatesRetryBackoffRate;
  const delay = interval * backoff ** taken;

  return retrier.MaxDelaySeconds === undefined
    ? delay
    : Math.min(delay, retrier.MaxDelaySeconds);
}

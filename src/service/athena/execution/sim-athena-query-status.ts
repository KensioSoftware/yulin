import {
  isSettledQueryState,
  type SimAthenaQueryState,
} from "./sim-athena-query-state.js";

/**
 * Where one query has got to, and how it got there.
 *
 * Held apart from the execution because it is the only part that changes. A
 * query that has settled stays as it settled, and that rule lives here so
 * every caller gets it rather than each one remembering to ask first.
 */
export class SimAthenaQueryStatus {
  #state: SimAthenaQueryState = "QUEUED";
  #stateChangeReason: string | undefined;
  #completedAt: Date | undefined;

  get state(): SimAthenaQueryState {
    return this.#state;
  }

  get stateChangeReason(): string | undefined {
    return this.#stateChangeReason;
  }

  get completedAt(): Date | undefined {
    return this.#completedAt;
  }

  get isSettled(): boolean {
    return isSettledQueryState(this.#state);
  }

  /**
   * Move a queued query to running.
   */
  start(): void {
    this.#state = "RUNNING";
  }

  /**
   * Finish the query, unless something already did.
   *
   * Writing a result set is awaited, so a `StopQueryExecution` can land while
   * it is in flight. Without this the write would carry a cancelled query
   * through to `SUCCEEDED` after its caller was told it had been stopped.
   */
  settle(
    state: SimAthenaQueryState,
    reason: string | undefined,
    completedAt: Date,
  ): boolean {
    if (this.isSettled) {
      return false;
    }

    this.#state = state;
    this.#stateChangeReason = reason;
    this.#completedAt = completedAt;

    return true;
  }
}

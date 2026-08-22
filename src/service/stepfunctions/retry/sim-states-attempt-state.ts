import type { SimStatesState } from "../definition/sim-states-state.js";
import {
  type SimStatesTaskDeadline,
  simStatesTaskDeadline,
} from "./sim-states-task-deadline.js";

/**
 * What one entry to a state has tried so far.
 *
 * A retry carries this to the attempt it schedules, so the attempt knows how
 * long the next wait is and when the state gives up. `taken` counts the
 * retries each retrier has taken, since Amazon States Language counts them per
 * retrier rather than per state.
 */
export interface SimStatesAttemptState {
  readonly taken: readonly number[];
  readonly deadline: SimStatesTaskDeadline | undefined;
}

/**
 * The first attempt at a state, which has tried nothing yet.
 *
 * Only a `Task` state carries the fields that give it a deadline. Every other
 * state runs once and answers.
 */
export function simStatesFirstAttempt(
  state: SimStatesState,
  now: Date,
): SimStatesAttemptState {
  return {
    taken: [],
    deadline: simStatesTaskDeadline(state.Type === "Task" ? state : {}, now),
  };
}

/**
 * How many retries one retrier has taken.
 */
export function simStatesRetriesTaken(
  attempt: SimStatesAttemptState,
  index: number,
): number {
  return attempt.taken.at(index) ?? 0;
}

/**
 * How many retries this entry to a state has taken, across its retriers.
 *
 * The context object reports this as `$$.State.RetryCount`, which counts the
 * state rather than the retrier that asked for each one.
 */
export function simStatesRetriesSoFar(attempt: SimStatesAttemptState): number {
  return attempt.taken.reduce((total, taken) => total + taken, 0);
}

/**
 * The same attempt state with one more retry counted against a retrier.
 */
export function simStatesRetryTaken(
  attempt: SimStatesAttemptState,
  index: number,
): SimStatesAttemptState {
  return {
    ...attempt,
    taken: Array.from(
      { length: Math.max(attempt.taken.length, index + 1) },
      (_, at) => (attempt.taken.at(at) ?? 0) + (at === index ? 1 : 0),
    ),
  };
}

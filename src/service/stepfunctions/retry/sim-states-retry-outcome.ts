import type {
  SimStatesFailOutcome,
  SimStatesRetryOutcome,
} from "../execution/sim-states-state-outcome.js";
import {
  type SimStatesAttemptState,
  simStatesRetriesTaken,
  simStatesRetryTaken,
} from "./sim-states-attempt-state.js";
import { simStatesErrorMatches } from "./sim-states-error-name.js";
import {
  type SimStatesRetrier,
  simStatesRetriesAllowed,
  simStatesRetryDelaySeconds,
} from "./sim-states-retrier.js";

const millisecondsInASecond = 1000;

/**
 * The next attempt a retrier asks for, where one matches and has attempts left.
 *
 * The retriers are tried in the order they were written and the first one
 * naming the error takes it. Each keeps its own count, the way Amazon States
 * Language counts them.
 */
export function simStatesRetryOutcome(
  retriers: readonly SimStatesRetrier[],
  failure: SimStatesFailOutcome,
  attempt: SimStatesAttemptState,
  now: Date,
): SimStatesRetryOutcome | undefined {
  const matched = retriers
    .map((retrier, index) => ({ retrier, index }))
    .find(({ retrier }) =>
      simStatesErrorMatches(retrier.ErrorEquals, failure.error),
    );

  if (matched === undefined) {
    return undefined;
  }

  const { retrier, index } = matched;
  const taken = simStatesRetriesTaken(attempt, index);

  if (taken >= simStatesRetriesAllowed(retrier)) {
    return undefined;
  }

  return {
    kind: "retry",
    until: dueAt(retrier, taken, attempt, now),
    attempt: simStatesRetryTaken(attempt, index),
  };
}

/**
 * When the next attempt runs.
 *
 * A wait running past the state's deadline is cut short at it. The task gives
 * up when it said it would, and not at the attempt it never made.
 */
function dueAt(
  retrier: SimStatesRetrier,
  taken: number,
  attempt: SimStatesAttemptState,
  now: Date,
): Date {
  const delay = simStatesRetryDelaySeconds(retrier, taken);
  const due = new Date(now.getTime() + delay * millisecondsInASecond);
  const { deadline } = attempt;

  return deadline !== undefined && deadline.at.getTime() < due.getTime()
    ? deadline.at
    : due;
}

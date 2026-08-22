import { simStatesFailureFrom } from "../execution/sim-states-failure.js";
import type { SimStatesStateOutcome } from "../execution/sim-states-state-outcome.js";
import type { SimStatesStateEntry } from "../execution/sim-states-walk.js";
import type { SimStatesAttemptState } from "./sim-states-attempt-state.js";
import { simStatesErrorHandling } from "./sim-states-error-handling.js";
import { simStatesRecover } from "./sim-states-recover.js";

interface SimStatesRecoveredProperties {
  readonly entry: SimStatesStateEntry;

  /**
   * What running the state produced, which is only handled where it failed.
   */
  readonly ran: SimStatesStateOutcome;

  readonly attempt: SimStatesAttemptState;
  readonly now: Date;
}

/**
 * What the state's own `Retry` and `Catch` make of a failure.
 *
 * A state whose type carries neither is left as it was, and its failure ends
 * the walk. A catcher whose `ResultPath` has nowhere to write fails the walk
 * the way any other data-flow field that cannot be applied does.
 */
export function simStatesRecovered(
  properties: SimStatesRecoveredProperties,
): SimStatesStateOutcome {
  const { attempt, entry, now, ran } = properties;

  if (ran.kind !== "fail") {
    return ran;
  }

  const handling = simStatesErrorHandling(entry.state);

  if (handling === undefined) {
    return ran;
  }

  try {
    return simStatesRecover({
      handling,
      input: entry.input,
      failure: ran,
      attempt,
      now,
    });
  } catch (error) {
    return simStatesFailureFrom(error);
  }
}

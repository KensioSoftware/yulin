import type { JSONValue } from "../../../util/type-guard/json.js";
import type {
  SimStatesFailOutcome,
  SimStatesStateOutcome,
} from "../execution/sim-states-state-outcome.js";
import type { SimStatesAttemptState } from "./sim-states-attempt-state.js";
import { simStatesCatchOutcome } from "./sim-states-catch-outcome.js";
import { simStatesTimeoutError } from "./sim-states-error-name.js";
import { simStatesRetryOutcome } from "./sim-states-retry-outcome.js";
import type { SimStatesTaskHandling } from "./sim-states-task-handling.js";

interface SimStatesRecoverProperties {
  /**
   * The `Retry` and `Catch` of the state that failed.
   */
  readonly handling: SimStatesTaskHandling;

  /**
   * The raw input the state was given, which is what a catcher's `ResultPath`
   * writes the error into.
   */
  readonly input: JSONValue;

  readonly failure: SimStatesFailOutcome;
  readonly attempt: SimStatesAttemptState;
  readonly now: Date;
}

/**
 * What a state's `Retry` and `Catch` make of a failure.
 *
 * The retriers are tried first and the catchers after them. A failure neither
 * retried nor caught is left as it was, and ends the execution.
 *
 * A task that ran out of time skips the retriers. The deadline covers the
 * state and not one attempt at it, and another attempt would find the clock
 * past it again.
 */
export function simStatesRecover(
  properties: SimStatesRecoverProperties,
): SimStatesStateOutcome {
  const { attempt, failure, handling, input, now } = properties;
  const retry =
    failure.error === simStatesTimeoutError
      ? undefined
      : simStatesRetryOutcome(handling.Retry ?? [], failure, attempt, now);

  return (
    retry ??
    simStatesCatchOutcome(handling.Catch ?? [], failure, input) ??
    failure
  );
}

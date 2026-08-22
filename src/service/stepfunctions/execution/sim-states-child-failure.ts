import {
  simStatesBranchFailedError,
  simStatesRuntimeError,
} from "../retry/sim-states-error-name.js";
import type { SimStatesFailOutcome } from "./sim-states-state-outcome.js";

/**
 * The failure one child takes the state that ran it down with.
 *
 * Amazon States Language gives a state whose child failed an error name of
 * its own, and the child's name is what the cause says. A child that failed on
 * the data it was given keeps `States.Runtime`, which nothing catches: a state
 * around it is no more able to carry on than the child was.
 */
export function simStatesChildFailure(
  named: string,
  failure: SimStatesFailOutcome,
): SimStatesFailOutcome {
  const said = failure.cause === undefined ? "" : `: ${failure.cause}`;

  return {
    kind: "fail",
    error:
      failure.error === simStatesRuntimeError
        ? simStatesRuntimeError
        : simStatesBranchFailedError,
    cause: `${named} failed with ${failure.error}${said}`,
  };
}

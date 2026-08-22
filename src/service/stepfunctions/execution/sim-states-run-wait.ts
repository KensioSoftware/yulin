import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  simStatesEffectiveInput,
  simStatesEffectiveOutput,
} from "../data/sim-states-data-flow.js";
import type { SimStatesWaitState } from "../definition/sim-states-state.js";
import { simStatesWaitDue } from "../wait/sim-states-wait-due.js";
import type {
  SimStatesMoveOnOutcome,
  SimStatesStateContext,
  SimStatesStateOutcome,
} from "./sim-states-state-outcome.js";

/**
 * A `Wait` state, which holds the execution until an instant on the clock.
 *
 * Like a `Choice` state it produces no result. What it passes on once the wait
 * is over is its own input.
 */
export function runSimStatesWait(
  state: SimStatesWaitState,
  input: JSONValue,
  context: SimStatesStateContext,
): SimStatesStateOutcome {
  const effective = simStatesEffectiveInput(input, state);
  const output = simStatesEffectiveOutput(effective, effective, state);
  const resume: SimStatesMoveOnOutcome =
    state.Next === undefined
      ? { kind: "succeed", output }
      : { kind: "next", output, next: state.Next };

  return {
    kind: "wait",
    until: simStatesWaitDue(state, effective, context.now),
    resume,
  };
}

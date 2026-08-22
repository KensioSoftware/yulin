import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  simStatesEffectiveInput,
  simStatesEffectiveOutput,
} from "../data/sim-states-data-flow.js";
import type { SimStatesChoiceState } from "../definition/sim-states-state.js";
import { SimStatesNoChoiceMatched } from "../error/sim-step-functions.error.js";
import type {
  SimStatesStateContext,
  SimStatesStateOutcome,
} from "./sim-states-state-outcome.js";

/**
 * A `Choice` state, which takes the first rule its input matches.
 *
 * The rules are tested in the order they were written, which is what lets a
 * definition put its narrower rule first. A `Choice` state produces no result,
 * so what it passes on is its own input.
 */
export function runSimStatesChoice(
  state: SimStatesChoiceState,
  input: JSONValue,
  context: SimStatesStateContext,
): SimStatesStateOutcome {
  const effective = simStatesEffectiveInput(
    input,
    state,
    context.contextObject,
  );
  const matched = state.Choices.find((rule) => rule.matches(effective));
  const next = matched?.next ?? state.Default;

  if (next === undefined) {
    throw new SimStatesNoChoiceMatched(
      `The Choice state ${context.stateName} matched none of its rules and ` +
        "carries no Default to fall back on.",
    );
  }

  return {
    kind: "next",
    output: simStatesEffectiveOutput(
      effective,
      effective,
      state,
      context.contextObject,
    ),
    next,
  };
}

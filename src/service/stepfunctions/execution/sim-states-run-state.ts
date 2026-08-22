import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  simStatesEffectiveInput,
  simStatesEffectiveOutput,
} from "../data/sim-states-data-flow.js";
import type {
  SimStatesFailState,
  SimStatesPassState,
  SimStatesState,
  SimStatesSucceedState,
} from "../definition/sim-states-state.js";
import { runSimStatesChoice } from "./sim-states-run-choice.js";
import { runSimStatesWait } from "./sim-states-run-wait.js";
import type {
  SimStatesStateContext,
  SimStatesStateOutcome,
} from "./sim-states-state-outcome.js";

/**
 * The default a `Fail` state reports when it names no error.
 */
const unnamedFailError = "States.Unknown";

/**
 * Run one state and say what happened.
 *
 * A data-flow field raising is left to the caller, which reads the Amazon
 * States Language error name off whatever came out.
 */
export function runSimStatesState(
  state: SimStatesState,
  input: JSONValue,
  context: SimStatesStateContext,
): SimStatesStateOutcome {
  if (state.Type === "Fail") {
    return runFail(state);
  }

  if (state.Type === "Succeed") {
    return runSucceed(state, input);
  }

  if (state.Type === "Choice") {
    return runSimStatesChoice(state, input, context);
  }

  if (state.Type === "Wait") {
    return runSimStatesWait(state, input, context);
  }

  return runPass(state, input);
}

/**
 * A `Pass` state, whose result is its `Result` or its effective input.
 */
function runPass(
  state: SimStatesPassState,
  input: JSONValue,
): SimStatesStateOutcome {
  const effective = simStatesEffectiveInput(input, state);
  const result = state.Result === undefined ? effective : state.Result;
  const output = simStatesEffectiveOutput(input, result, state);

  return state.Next === undefined
    ? { kind: "succeed", output }
    : { kind: "next", output, next: state.Next };
}

/**
 * A `Succeed` state, which ends the execution with what reaches it.
 */
function runSucceed(
  state: SimStatesSucceedState,
  input: JSONValue,
): SimStatesStateOutcome {
  const effective = simStatesEffectiveInput(input, state);

  return {
    kind: "succeed",
    output: simStatesEffectiveOutput(effective, effective, state),
  };
}

/**
 * A `Fail` state, which ends the execution with the error it names.
 */
function runFail(state: SimStatesFailState): SimStatesStateOutcome {
  return {
    kind: "fail",
    error: state.Error ?? unnamedFailError,
    cause: state.Cause,
  };
}

import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  simStatesEffectiveInput,
  simStatesEffectiveOutput,
} from "../data/sim-states-data-flow.js";
import type { SimStatesTaskState } from "../definition/sim-states-state.js";
import type {
  SimStatesStateContext,
  SimStatesStateOutcome,
} from "./sim-states-state-outcome.js";

/**
 * A `Task` state, which does its work outside the state machine.
 *
 * The data-flow fields apply around the work the way they do around any other
 * state. `InputPath` and `Parameters` build what the task is sent, and
 * `ResultSelector`, `ResultPath` and `OutputPath` shape what comes back.
 * `ResultPath` reads the state's raw input, so a task can put its result
 * beside the input it was given.
 */
export async function runSimStatesTask(
  state: SimStatesTaskState,
  input: JSONValue,
  context: SimStatesStateContext,
): Promise<SimStatesStateOutcome> {
  const result = await context.tasks.invoke({
    stateName: context.stateName,
    target: state.target,
    payload: simStatesEffectiveInput(input, state),
    roleArn: context.roleArn,
  });

  const output = simStatesEffectiveOutput(input, result, state);

  return state.Next === undefined
    ? { kind: "succeed", output }
    : { kind: "next", output, next: state.Next };
}

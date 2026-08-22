import type { JSONValue } from "../../../util/type-guard/json.js";
import { simStatesEffectiveInput } from "../data/sim-states-data-flow.js";
import type { SimStatesParallelState } from "../definition/sim-states-state.js";
import { SimStatesFanOut } from "./sim-states-fan-out.js";
import { simStatesFanOutOutcome } from "./sim-states-fan-out-outcome.js";
import type {
  SimStatesStateContext,
  SimStatesStateOutcome,
} from "./sim-states-state-outcome.js";

/**
 * A `Parallel` state, which runs each of its branches on the same input.
 *
 * Every branch is given the state's effective input, so `InputPath` and
 * `Parameters` are applied once rather than per branch. The result is an array
 * of what each branch produced, in the order the branches were written, and
 * `ResultSelector`, `ResultPath` and `OutputPath` then apply to that array.
 *
 * All the branches run at once. Nothing bounds how many of them are going,
 * which is what Amazon States Language says of a `Parallel` state.
 */
export async function runSimStatesParallel(
  state: SimStatesParallelState,
  input: JSONValue,
  context: SimStatesStateContext,
): Promise<SimStatesStateOutcome> {
  const effective = simStatesEffectiveInput(
    input,
    state,
    context.contextObject,
  );

  return await new SimStatesFanOut({
    context,
    kind: "branch",
    limit: Infinity,
    children: state.Branches.map((definition, index) => ({
      index,
      definition,
      input: effective,
      contextObject: context.contextObject,
    })),
    names: (index) =>
      `Branch ${String(index + 1)} of the Parallel state ${context.stateName}`,
    answers: (outputs) =>
      simStatesFanOutOutcome(state, input, outputs, context.contextObject),
  }).run();
}

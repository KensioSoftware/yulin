import type { JSONValue } from "../../../util/type-guard/json.js";
import { simStatesEffectiveInput } from "../data/sim-states-data-flow.js";
import type { SimStatesMapState } from "../definition/sim-states-state.js";
import { SimStatesFanOut } from "./sim-states-fan-out.js";
import { simStatesFanOutOutcome } from "./sim-states-fan-out-outcome.js";
import {
  simStatesMapConcurrency,
  simStatesMapIteration,
} from "./sim-states-map-iteration.js";
import { simStatesMapItems } from "./sim-states-map-items.js";
import type {
  SimStatesStateContext,
  SimStatesStateOutcome,
} from "./sim-states-state-outcome.js";

/**
 * A `Map` state, which runs its `ItemProcessor` once per item.
 *
 * The result is an array of what each iteration produced, in the order the
 * items were in rather than the order the iterations finished. An empty array
 * of items runs the processor no times and answers with an empty array.
 */
export async function runSimStatesMap(
  state: SimStatesMapState,
  input: JSONValue,
  context: SimStatesStateContext,
): Promise<SimStatesStateOutcome> {
  const effective = simStatesEffectiveInput(
    input,
    state,
    context.contextObject,
  );
  const items = simStatesMapItems(state, effective, context);

  return await new SimStatesFanOut({
    context,
    kind: "iteration",
    limit: simStatesMapConcurrency(state),
    children: items.map((item, index) =>
      simStatesMapIteration({ state, effective, item, index, context }),
    ),
    names: (index) =>
      `Iteration ${String(index)} of the Map state ${context.stateName}`,
    answers: (outputs) =>
      simStatesFanOutOutcome(state, input, outputs, context.contextObject),
  }).run();
}

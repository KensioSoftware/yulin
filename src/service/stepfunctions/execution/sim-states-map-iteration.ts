import type { JSONValue } from "../../../util/type-guard/json.js";
import { simStatesMapItemContext } from "../data/sim-states-context-object.js";
import { evaluateSimStatesPayloadTemplate } from "../data/sim-states-payload-template.js";
import type { SimStatesMapState } from "../definition/sim-states-state.js";
import type { SimStatesChildStart } from "./sim-states-child-runs.js";
import type { SimStatesStateContext } from "./sim-states-state-outcome.js";

/**
 * What a `MaxConcurrency` of 0 means, which is every iteration at once.
 */
const unbounded = Infinity;

interface SimStatesMapIterationProperties {
  readonly state: SimStatesMapState;

  /**
   * The `Map` state's effective input, which `ItemSelector` reads through `$`.
   */
  readonly effective: JSONValue;

  readonly item: JSONValue;
  readonly index: number;
  readonly context: SimStatesStateContext;
}

/**
 * How many iterations one `Map` state runs at once.
 *
 * A state carrying no `MaxConcurrency`, or one of 0, runs all of them. Both
 * arrive here as an infinite bound, which is the bound the fan-out subtracts
 * from.
 */
export function simStatesMapConcurrency(state: SimStatesMapState): number {
  const bound = state.MaxConcurrency ?? 0;

  return bound === 0 ? unbounded : bound;
}

/**
 * One iteration, and what it is given to work on.
 *
 * `ItemSelector` reads the state's own effective input through `$`, and the
 * item it is building for through `$$.Map.Item`. A state carrying none gives
 * the iteration the item itself.
 */
export function simStatesMapIteration(
  properties: SimStatesMapIterationProperties,
): SimStatesChildStart {
  const { context, effective, index, item, state } = properties;

  const contextObject = simStatesMapItemContext(
    context.contextObject,
    index,
    item,
  );

  return {
    index,
    definition: state.ItemProcessor,
    contextObject,
    input:
      state.ItemSelector === undefined
        ? item
        : evaluateSimStatesPayloadTemplate(
            state.ItemSelector,
            effective,
            contextObject,
          ),
  };
}

import type { JSONValue } from "../../../util/type-guard/json.js";
import { selectSimStatesReadPath } from "../data/sim-states-context-path.js";
import type { SimStatesMapState } from "../definition/sim-states-state.js";
import { SimStatesRuntimeFailure } from "../error/sim-step-functions.error.js";
import type { SimStatesStateContext } from "./sim-states-state-outcome.js";

/**
 * The items one `Map` state runs its `ItemProcessor` over.
 *
 * `ItemsPath` selects them out of the state's effective input, and a state
 * carrying none runs over that input itself. Real Step Functions fails the
 * execution with `States.Runtime` where what it finds is not an array, and so
 * does this.
 */
export function simStatesMapItems(
  state: SimStatesMapState,
  effective: JSONValue,
  context: SimStatesStateContext,
): readonly JSONValue[] {
  const items = selected(state, effective, context);

  if (!Array.isArray(items)) {
    throw new SimStatesRuntimeFailure(
      `The Map state ${context.stateName} reads its items from ` +
        `${state.ItemsPath ?? "$"}, which holds ${found(items)} rather than ` +
        "an array.",
    );
  }

  return items;
}

/**
 * What the state found there, for the failure it ends with.
 */
function found(items: JSONValue | undefined): string {
  if (items === undefined) {
    return "nothing";
  }

  return JSON.stringify(items);
}

/**
 * What the state's `ItemsPath` selects, which may be nothing at all.
 */
function selected(
  state: SimStatesMapState,
  effective: JSONValue,
  context: SimStatesStateContext,
): JSONValue | undefined {
  if (state.ItemsPath === undefined) {
    return effective;
  }

  return selectSimStatesReadPath(
    state.ItemsPath,
    effective,
    context.contextObject,
  );
}

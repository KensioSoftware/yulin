import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesState } from "../definition/sim-states-state.js";
import { parseSimStatesCatchers } from "./sim-states-catch-parse.js";
import type { SimStatesCatcher } from "./sim-states-catcher.js";
import type { SimStatesRetrier } from "./sim-states-retrier.js";
import { parseSimStatesRetriers } from "./sim-states-retry-parse.js";

/**
 * What a state says about failing.
 *
 * A `Task` state and a `Parallel` state both carry these two, and both read
 * them the same way: the retriers first and the catchers after them.
 */
export interface SimStatesErrorHandling {
  readonly Retry?: readonly SimStatesRetrier[];
  readonly Catch?: readonly SimStatesCatcher[];
}

/**
 * The `Retry` and `Catch` a state carries, where its type has them.
 *
 * A `Task` state and a `Parallel` state carry both. Every other state type
 * fails the walk it is in, since there is nothing on it to say otherwise.
 */
export function simStatesErrorHandling(
  state: SimStatesState,
): SimStatesErrorHandling | undefined {
  if (state.Type === "Task" || state.Type === "Parallel") {
    return state;
  }

  return undefined;
}

/**
 * The `Retry` and `Catch` a state was written with, as the objects a failure
 * is handled by.
 *
 * A state carrying neither is left carrying neither, since the two fields are
 * spread over the state as it was written.
 */
export function parseSimStatesErrorHandling(
  named: string,
  state: Record<string, JSONValue>,
): SimStatesErrorHandling {
  const retriers = parseSimStatesRetriers(named, state);
  const catchers = parseSimStatesCatchers(named, state);

  return {
    ...(retriers !== undefined && { Retry: retriers }),
    ...(catchers !== undefined && { Catch: catchers }),
  };
}

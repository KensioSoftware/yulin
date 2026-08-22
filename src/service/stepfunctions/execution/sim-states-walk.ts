import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesState } from "../definition/sim-states-state.js";
import type { SimStatesNextOutcome } from "./sim-states-state-outcome.js";

/**
 * One entry to one state, as the walk reaches it.
 */
export interface SimStatesStateEntry {
  readonly name: string;
  readonly state: SimStatesState;
  readonly input: JSONValue;
}

/**
 * How the rest of the walk carries on from a state that held it up.
 *
 * A state that ended the walk rather than moving it on carries nothing, and
 * the walk is over when this answers.
 */
export type SimStatesWalkOn = (
  outcome: SimStatesNextOutcome | undefined,
) => Promise<void>;

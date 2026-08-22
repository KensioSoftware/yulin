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
 * How the rest of the walk carries on from a state the clock held up.
 */
export type SimStatesWalkOn = (outcome: SimStatesNextOutcome) => Promise<void>;

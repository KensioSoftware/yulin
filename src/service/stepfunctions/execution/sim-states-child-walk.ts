import type { JSONObject } from "../../../util/type-guard/json.js";
import type { SimStatesDefinition } from "../definition/sim-states-definition.js";
import type { SimStatesRunRecord } from "./sim-states-run-record.js";

export interface SimStatesChildWalkProperties {
  /**
   * The states the child walks, which is a state machine of its own.
   */
  readonly definition: SimStatesDefinition;

  /**
   * What the child records itself on, and where its input comes from.
   */
  readonly record: SimStatesRunRecord;

  /**
   * What the child's states read through `$$`.
   */
  readonly contextObject: JSONObject;

  /**
   * What to do once the child has ended, whenever that turns out to be. An
   * execution's own walk has nothing holding it, and carries none.
   */
  readonly onSettled?: () => Promise<void>;
}

/**
 * A walk over one branch's states.
 */
export interface SimStatesChildWalk {
  /**
   * Run the branch as far as it goes without waiting on the clock.
   *
   * This answers with the branch either ended or waiting for simulated time
   * to reach something. The branch says which by settling its own record.
   */
  run(): Promise<void>;
}

/**
 * How a state that runs states of its own gets a walk over them.
 *
 * The interpreter hands this to the states it runs, so a `Parallel` state
 * reaches the same walk the execution is running on without having to know
 * how one is built.
 */
export type SimStatesChildWalks = (
  properties: SimStatesChildWalkProperties,
) => SimStatesChildWalk;

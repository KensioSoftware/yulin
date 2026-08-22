import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesChildRun } from "./sim-states-child-run.js";

/**
 * What a walk over a set of states records as it goes.
 *
 * An execution is one of these, and so is a `Parallel` state's branch. The
 * interpreter walks either without knowing which it has, so a branch gets the
 * same `Wait` states, the same retries and the same clock as the execution
 * holding it.
 */
export interface SimStatesRunRecord {
  /**
   * What the walk starts at its first state with.
   */
  readonly input: JSONValue;

  /**
   * Whether the walk is over, so nothing more of it should run.
   *
   * A branch a sibling's failure abandoned reads as stopped while its states
   * are still scheduled on the clock, which is what stops them.
   */
  readonly stopped: boolean;

  /**
   * Record that the walk has entered a state.
   */
  enter(stateName: string): void;

  /**
   * Record that the walk ran a state, and what that run failed with.
   */
  attempt(stateName: string, error: string | undefined): void;

  /**
   * End the walk with the value its last state produced.
   */
  succeed(output: JSONValue, at: Date): void;

  /**
   * End the walk with the error that stopped it.
   */
  fail(error: string, cause: string | undefined, at: Date): void;

  /**
   * Record a branch, which is reported on the execution however deeply
   * nested the state running it is. A branch that is given up on gives up on
   * the branches it was running, so the run is held rather than what it
   * reports.
   */
  child(child: SimStatesChildRun): void;
}

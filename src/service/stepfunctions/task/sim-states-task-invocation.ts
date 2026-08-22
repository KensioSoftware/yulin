import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesTaskTarget } from "./sim-states-task-target.js";

/**
 * One `Task` state's invocation, as the state leaves it.
 */
export interface SimStatesTaskInvocation {
  readonly stateName: string;
  readonly target: SimStatesTaskTarget;

  /**
   * What the state's `InputPath` and `Parameters` produced.
   */
  readonly payload: JSONValue;

  /**
   * The state machine's execution role, which the execution assumes to do the
   * work.
   */
  readonly roleArn: string;
}

/**
 * Where a `Task` state's work is done.
 *
 * A state machine reaches a function through this rather than holding one, so
 * a `SimStepFunctions` built on its own has somewhere to say that there is
 * nothing to reach.
 */
export interface SimStatesTaskTargets {
  invoke(invocation: SimStatesTaskInvocation): Promise<JSONValue>;
}

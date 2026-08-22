import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesAttemptState } from "../retry/sim-states-attempt-state.js";
import type { SimStatesTaskTargets } from "../task/sim-states-task-invocation.js";

/**
 * What a state leaves the execution to do once it has run.
 */
export interface SimStatesNextOutcome {
  readonly kind: "next";
  readonly output: JSONValue;
  readonly next: string;
}

export type SimStatesMoveOnOutcome =
  | SimStatesNextOutcome
  | { readonly kind: "succeed"; readonly output: JSONValue };

export interface SimStatesFailOutcome {
  readonly kind: "fail";
  readonly error: string;
  readonly cause: string | undefined;
}

/**
 * What running one state did to the execution, where it is over and done with.
 */
export type SimStatesSettledOutcome =
  | SimStatesMoveOnOutcome
  | SimStatesFailOutcome;

/**
 * A state that failed and is being tried again at an instant on the clock.
 *
 * The attempt state goes with it, so the attempt the clock releases knows what
 * has already been tried.
 */
export interface SimStatesRetryOutcome {
  readonly kind: "retry";
  readonly until: Date;
  readonly attempt: SimStatesAttemptState;
}

/**
 * A `Wait` state, holding the execution until an instant on the clock.
 */
export interface SimStatesWaitOutcome {
  readonly kind: "wait";
  readonly until: Date;
  readonly resume: SimStatesMoveOnOutcome;
}

export type SimStatesStateOutcome =
  | SimStatesSettledOutcome
  | SimStatesRetryOutcome
  | SimStatesWaitOutcome;

/**
 * What a state knows about the execution it is running in.
 */
export interface SimStatesStateContext {
  readonly stateName: string;
  readonly now: Date;

  /**
   * Where a `Task` state does its work.
   */
  readonly tasks: SimStatesTaskTargets;

  /**
   * The state machine's execution role, which a task assumes.
   */
  readonly roleArn: string;
}

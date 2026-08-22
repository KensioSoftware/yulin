import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesAttemptState } from "../retry/sim-states-attempt-state.js";
import type { SimStatesTaskTargets } from "../task/sim-states-task-invocation.js";
import type { SimStatesChildWalks } from "./sim-states-child-walk.js";
import type { SimStatesRunRecord } from "./sim-states-run-record.js";

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

/**
 * A state that has suspended, and will say what it did later.
 *
 * A `Parallel` state whose branches are waiting on the clock is neither done
 * nor waiting for an instant of its own. The walk stops here, and the state
 * carries on through the `resume` it was given once its branches have
 * finished.
 */
export interface SimStatesPendingOutcome {
  readonly kind: "pending";
}

export type SimStatesStateOutcome =
  | SimStatesSettledOutcome
  | SimStatesRetryOutcome
  | SimStatesWaitOutcome
  | SimStatesPendingOutcome;

/**
 * How a state that suspended says what it finally did.
 */
export type SimStatesResume = (
  outcome: SimStatesSettledOutcome,
) => Promise<void>;

/**
 * What every state of one walk is given, whichever state it is.
 */
export interface SimStatesWalkContext {
  /**
   * Where a `Task` state does its work.
   */
  readonly tasks: SimStatesTaskTargets;

  /**
   * The state machine's execution role, which a task assumes.
   */
  readonly roleArn: string;

  /**
   * What the walk is recording itself on, which a `Parallel` state's branch
   * hangs off.
   */
  readonly record: SimStatesRunRecord;

  /**
   * How a state that runs states of its own gets a walk over them.
   */
  readonly walkChild: SimStatesChildWalks;
}

/**
 * What a state knows about the execution it is running in.
 */
export interface SimStatesStateContext extends SimStatesWalkContext {
  readonly stateName: string;
  readonly now: Date;

  /**
   * How a state that suspends says what it finally did.
   */
  readonly resume: SimStatesResume;
}

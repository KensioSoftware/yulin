import type { JSONValue } from "../../../util/type-guard/json.js";
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

/**
 * What running one state did to the execution.
 *
 * A `wait` outcome carries what the execution does once the clock reaches the
 * instant, which is either the next state or the end of the execution.
 */
export type SimStatesSettledOutcome =
  | SimStatesMoveOnOutcome
  | {
      readonly kind: "fail";
      readonly error: string;
      readonly cause: string | undefined;
    };

export type SimStatesStateOutcome =
  | SimStatesSettledOutcome
  | {
      readonly kind: "wait";
      readonly until: Date;
      readonly resume: SimStatesMoveOnOutcome;
    };

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

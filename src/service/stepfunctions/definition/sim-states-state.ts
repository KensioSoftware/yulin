import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesChoiceRule } from "../choice/sim-states-choice-rule.js";
import type { SimStatesDataFlowFields } from "../data/sim-states-data-flow.js";
import type { SimStatesTaskTarget } from "../task/sim-states-task-target.js";

/**
 * Every state type Amazon States Language defines.
 *
 * The ones this simulator has no implementation for are named here so a
 * definition using one can be refused by its own name.
 */
export const simStatesStateTypes = [
  "Pass",
  "Succeed",
  "Fail",
  "Task",
  "Choice",
  "Wait",
  "Parallel",
  "Map",
] as const;

export type SimStatesStateType = (typeof simStatesStateTypes)[number];

/**
 * The state types this simulator runs.
 */
export const simStatesRunnableTypes = [
  "Pass",
  "Succeed",
  "Fail",
  "Task",
  "Choice",
  "Wait",
] as const;

export type SimStatesRunnableType = (typeof simStatesRunnableTypes)[number];

/**
 * What every state carries, whatever its type.
 */
interface SimStatesCommonState extends SimStatesDataFlowFields {
  readonly Comment?: string;
  readonly Next?: string;
  readonly End?: boolean;
}

/**
 * A `Pass` state, which produces a result without doing any work.
 */
export interface SimStatesPassState extends SimStatesCommonState {
  readonly Type: "Pass";
  readonly Result?: JSONValue;
}

/**
 * A `Task` state, which does work outside the state machine.
 *
 * `Resource` is held as it was written, and `target` is what it named. The
 * `Resource` is read when the definition is read, so one this simulator cannot
 * reach is refused there rather than when an execution arrives at the state.
 */
export interface SimStatesTaskState extends SimStatesCommonState {
  readonly Type: "Task";
  readonly Resource: string;
  readonly target: SimStatesTaskTarget;
}

/**
 * A `Succeed` state, which ends an execution successfully.
 */
export interface SimStatesSucceedState extends SimStatesCommonState {
  readonly Type: "Succeed";
}

/**
 * A `Choice` state, which picks where the execution goes by testing its input.
 *
 * A `Choice` state has no result of its own, so it carries the two paths and
 * none of the other data-flow fields.
 */
export interface SimStatesChoiceState {
  readonly Type: "Choice";
  readonly Comment?: string;
  readonly InputPath?: string | null;
  readonly OutputPath?: string | null;
  readonly Choices: readonly SimStatesChoiceRule[];
  readonly Default?: string;
}

/**
 * A `Wait` state, which holds the execution until an instant on the clock.
 */
export interface SimStatesWaitState {
  readonly Type: "Wait";
  readonly Comment?: string;
  readonly InputPath?: string | null;
  readonly OutputPath?: string | null;
  readonly Next?: string;
  readonly End?: boolean;
  readonly Seconds?: number;
  readonly SecondsPath?: string;
  readonly Timestamp?: string;
  readonly TimestampPath?: string;
}

/**
 * A `Fail` state, which ends an execution with an error.
 *
 * Real Step Functions gives `Fail` no input or output processing, so the
 * data-flow fields on it are refused when the definition is read.
 */
export interface SimStatesFailState {
  readonly Type: "Fail";
  readonly Comment?: string;
  readonly Error?: string;
  readonly Cause?: string;
}

export type SimStatesState =
  | SimStatesPassState
  | SimStatesTaskState
  | SimStatesSucceedState
  | SimStatesFailState
  | SimStatesChoiceState
  | SimStatesWaitState;

/**
 * Whether a state ends the execution when it is reached.
 */
export function isSimStatesTerminal(state: SimStatesState): boolean {
  return state.Type === "Succeed" || state.Type === "Fail";
}

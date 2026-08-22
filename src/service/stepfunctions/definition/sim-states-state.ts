import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesChoiceRule } from "../choice/sim-states-choice-rule.js";
import type { SimStatesDataFlowFields } from "../data/sim-states-data-flow.js";
import type { SimStatesErrorHandling } from "../retry/sim-states-error-handling.js";
import type { SimStatesTaskHandling } from "../retry/sim-states-task-handling.js";
import type { SimStatesTaskTarget } from "../task/sim-states-task-target.js";
import type { SimStatesDefinition } from "./sim-states-definition.js";

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
  "Parallel",
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
 * `Retry` and `Catch` are read there too, and arrive here as the retriers and
 * catchers a failing task is handled by.
 */
export interface SimStatesTaskState
  extends SimStatesCommonState, SimStatesTaskHandling {
  readonly Type: "Task";
  readonly Resource: string;
  readonly target: SimStatesTaskTarget;
}

/**
 * A `Parallel` state, which runs each of its branches on the same input.
 *
 * A branch is a state machine of its own, with its own `StartAt` and its own
 * states. The branches are read when the definition is read, so a `Parallel`
 * state that runs is one whose branches are already known to be good.
 */
export interface SimStatesParallelState
  extends SimStatesCommonState, SimStatesErrorHandling {
  readonly Type: "Parallel";
  readonly Branches: readonly SimStatesDefinition[];
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
  | SimStatesParallelState
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

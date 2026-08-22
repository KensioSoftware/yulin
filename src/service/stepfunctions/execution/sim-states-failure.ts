import { SimStepFunctionsError } from "../error/sim-step-functions.error.js";
import type { SimStatesSettledOutcome } from "./sim-states-state-outcome.js";

/**
 * Read the Amazon States Language error name off whatever was raised.
 */
export function simStatesFailureFrom(error: unknown): SimStatesSettledOutcome {
  if (error instanceof SimStepFunctionsError) {
    return {
      kind: "fail",
      error: error.statesErrorName,
      cause: error.message,
    };
  }

  return {
    kind: "fail",
    error: "States.Runtime",
    cause: error instanceof Error ? error.message : String(error),
  };
}

/**
 * How many state transitions one execution may make.
 *
 * Amazon States Language allows a cycle, so a definition can be valid and
 * still never reach a terminal state. Real Step Functions stops such an
 * execution when it runs out of execution history events, and this stands in
 * for that limit. Without it the walk never returns and `StartExecution` never
 * answers, which is the one failure a test tool must not have.
 */
export const simStatesMaximumTransitions = 25_000;

/**
 * The failure an execution whose states form a cycle ends with.
 */
export function simStatesCycleFailure(): SimStatesSettledOutcome {
  return {
    kind: "fail",
    error: "States.Runtime",
    cause:
      `The execution made ${String(simStatesMaximumTransitions)} ` +
      "transitions without reaching a terminal state. Its states form a cycle.",
  };
}

/**
 * The failure a transition naming no state ends the execution with.
 */
export function simStatesUnknownStateFailure(
  name: string,
): SimStatesSettledOutcome {
  return {
    kind: "fail",
    error: "States.Runtime",
    cause: `The state ${name} is not one of this state machine's states.`,
  };
}

import type { SimStatesAttempt } from "./execution/sim-states-attempt.js";
import type { SimStatesExecutionStore } from "./execution/sim-states-execution-store.js";

/**
 * What a test can read about the executions a simulated Step Functions has
 * run.
 *
 * This is the simulator's own accessor rather than an AWS API.
 * `GetExecutionHistory` answers the same question on real Step Functions, with
 * an event stream that carries far more than a test usually asserts on.
 */
export class SimStepFunctionsInspection {
  readonly #executions: SimStatesExecutionStore;

  constructor(executions: SimStatesExecutionStore) {
    this.#executions = executions;
  }

  /**
   * The states one execution entered, in the order it entered them.
   */
  visitedStates(executionArn: string): readonly string[] {
    return this.#executions.find(executionArn)?.visitedStates ?? [];
  }

  /**
   * Every run of a state one execution made, in the order it made them.
   *
   * A state a `Retry` ran again appears once per attempt, so this says how many
   * times a task ran where `visitedStates` says only that the execution reached
   * it. Each attempt carries the error name it failed with, where it failed.
   */
  attempts(executionArn: string): readonly SimStatesAttempt[] {
    return this.#executions.find(executionArn)?.attempts ?? [];
  }

  /**
   * Every execution of one state machine, most recently started first.
   */
  executionsOf(stateMachineArn: string): readonly string[] {
    return this.#executions
      .forStateMachine(stateMachineArn)
      .map((execution) => execution.arn);
  }
}

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
   * Every execution of one state machine, most recently started first.
   */
  executionsOf(stateMachineArn: string): readonly string[] {
    return this.#executions
      .forStateMachine(stateMachineArn)
      .map((execution) => execution.arn);
  }
}

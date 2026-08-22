import type { SimStatesAttempt } from "./execution/sim-states-attempt.js";
import type { SimStatesChild } from "./execution/sim-states-child.js";
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
   * Every branch of every `Parallel` state one execution ran.
   *
   * A branch runs states of its own, so what it did is reported here rather
   * than among the states the execution around it visited. The branches are in
   * the order they were started, and each says where among its siblings it
   * was.
   */
  branches(executionArn: string): readonly SimStatesChild[] {
    return this.#childrenOf(executionArn, "branch");
  }

  /**
   * Every iteration of every `Map` state one execution ran.
   *
   * An iteration runs states of its own, the way a `Parallel` state's branch
   * does, and is reported here rather than among the states the execution
   * around it visited. Each says which item it was for by its index, counting
   * from zero.
   */
  iterations(executionArn: string): readonly SimStatesChild[] {
    return this.#childrenOf(executionArn, "iteration");
  }

  /**
   * Every execution of one state machine, most recently started first.
   */
  executionsOf(stateMachineArn: string): readonly string[] {
    return this.#executions
      .forStateMachine(stateMachineArn)
      .map((execution) => execution.arn);
  }

  /**
   * The child runs of one kind that one execution made.
   */
  #childrenOf(
    executionArn: string,
    kind: SimStatesChild["kind"],
  ): readonly SimStatesChild[] {
    return (this.#executions.find(executionArn)?.children ?? []).filter(
      (child) => child.kind === kind,
    );
  }
}

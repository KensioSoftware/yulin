import type { SimStatesExecution } from "./sim-states-execution.js";

/**
 * The executions one simulated Step Functions holds, by ARN.
 *
 * Executions are kept after they end. `DescribeExecution` answers for a
 * finished one, and real Step Functions keeps a standard execution's history
 * for 90 days.
 */
export class SimStatesExecutionStore {
  readonly #byArn = new Map<string, SimStatesExecution>();

  add(execution: SimStatesExecution): void {
    this.#byArn.set(execution.arn, execution);
  }

  find(arn: string): SimStatesExecution | undefined {
    return this.#byArn.get(arn);
  }

  /**
   * Every execution of one state machine, most recently started first.
   */
  forStateMachine(stateMachineArn: string): readonly SimStatesExecution[] {
    return this.#byArn
      .values()
      .filter((execution) => execution.stateMachineArn === stateMachineArn)
      .toArray()
      .toReversed();
  }

  /**
   * One state machine's execution of a name, where it has one.
   *
   * Real Step Functions keeps a name taken for 90 days after the execution
   * closes, which is what makes a name usable for idempotency.
   */
  findByName(
    stateMachineArn: string,
    name: string,
  ): SimStatesExecution | undefined {
    return this.#byArn
      .values()
      .find(
        (execution) =>
          execution.stateMachineArn === stateMachineArn &&
          execution.name === name,
      );
  }

  /**
   * Whether one state machine already has an execution of this name.
   */
  hasName(stateMachineArn: string, name: string): boolean {
    return this.findByName(stateMachineArn, name) !== undefined;
  }

  /**
   * Forget every execution of one state machine.
   */
  removeForStateMachine(stateMachineArn: string): void {
    for (const [arn, execution] of this.#byArn) {
      if (execution.stateMachineArn === stateMachineArn) {
        this.#byArn.delete(arn);
      }
    }
  }
}

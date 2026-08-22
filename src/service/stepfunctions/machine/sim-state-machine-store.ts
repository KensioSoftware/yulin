import type { SimStateMachine } from "./sim-state-machine.js";

/**
 * The state machines one simulated Step Functions holds.
 *
 * Kept by name as well as by ARN, since `CreateStateMachine` takes a name and
 * every other command takes an ARN.
 */
export class SimStateMachineStore {
  readonly #byArn = new Map<string, SimStateMachine>();

  add(stateMachine: SimStateMachine): void {
    this.#byArn.set(stateMachine.arn, stateMachine);
  }

  find(arn: string): SimStateMachine | undefined {
    return this.#byArn.get(arn);
  }

  findByName(name: string): SimStateMachine | undefined {
    return this.#byArn.values().find((machine) => machine.name === name);
  }

  remove(arn: string): void {
    this.#byArn.delete(arn);
  }

  /**
   * Every state machine, by name, which is the order real `ListStateMachines`
   * answers in.
   */
  all(): readonly SimStateMachine[] {
    return this.#byArn
      .values()
      .toArray()
      .toSorted((one, other) => one.name.localeCompare(other.name));
  }
}

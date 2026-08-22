import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { parseSimStatesDefinition } from "../../definition/sim-states-definition-parse.js";
import type { SimStatesExecutionStore } from "../../execution/sim-states-execution-store.js";
import type { SimStateMachineStore } from "../../machine/sim-state-machine-store.js";
import type {
  SimDeleteStateMachineCommand,
  SimDeleteStateMachineCommandOutput,
  SimUpdateStateMachineCommand,
  SimUpdateStateMachineCommandOutput,
} from "./machine.command.js";
import { requireSimStateMachine } from "./sim-state-machine-lookup.js";

interface SimStateMachineWritesProperties {
  readonly stateMachines: SimStateMachineStore;
  readonly executions: SimStatesExecutionStore;
  readonly background: BackgroundScheduler;
}

/**
 * The commands that change and delete state machines.
 */
export class SimStateMachineWrites {
  readonly #stateMachines: SimStateMachineStore;
  readonly #executions: SimStatesExecutionStore;
  readonly #background: BackgroundScheduler;

  constructor(properties: SimStateMachineWritesProperties) {
    this.#stateMachines = properties.stateMachines;
    this.#executions = properties.executions;
    this.#background = properties.background;
  }

  /**
   * Change a state machine's definition or role.
   */
  update(
    command: SimUpdateStateMachineCommand,
  ): SimUpdateStateMachineCommandOutput {
    const { stateMachineArn, definition, roleArn } = command.input;
    const found = requireSimStateMachine(
      this.#stateMachines,
      stateMachineArn,
      "UpdateStateMachine",
    );

    found.update({
      roleArn,
      definition,
      parsed:
        definition === undefined
          ? undefined
          : parseSimStatesDefinition(definition),
    });

    return { updateDate: this.#background.now() };
  }

  /**
   * Delete a state machine and forget its executions.
   */
  delete(
    command: SimDeleteStateMachineCommand,
  ): SimDeleteStateMachineCommandOutput {
    const found = requireSimStateMachine(
      this.#stateMachines,
      command.input.stateMachineArn,
      "DeleteStateMachine",
    );

    this.#stateMachines.remove(found.arn);
    this.#executions.removeForStateMachine(found.arn);

    return {};
  }
}

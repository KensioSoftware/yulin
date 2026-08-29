import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { parseSimStatesDefinition } from "../../definition/sim-states-definition-parse.js";
import { SimStatesInvalidRequest } from "../../error/sim-step-functions.error.js";
import type { SimStateMachineStore } from "../../machine/sim-state-machine-store.js";
import type {
  SimUpdateStateMachineCommand,
  SimUpdateStateMachineCommandOutput,
} from "./machine.command.js";
import { requireSimStateMachine } from "./sim-state-machine-lookup.js";

interface SimStateMachineUpdateProperties {
  readonly stateMachines: SimStateMachineStore;
  readonly background: BackgroundScheduler;
}

/**
 * The command that changes a state machine's definition or role.
 */
export class SimStateMachineUpdate {
  readonly #stateMachines: SimStateMachineStore;
  readonly #background: BackgroundScheduler;

  constructor(properties: SimStateMachineUpdateProperties) {
    this.#stateMachines = properties.stateMachines;
    this.#background = properties.background;
  }

  /**
   * Change a state machine's definition or role.
   */
  handle(
    command: SimUpdateStateMachineCommand,
  ): SimUpdateStateMachineCommandOutput {
    const { stateMachineArn, definition, roleArn } = command.input;

    if (definition === undefined && roleArn === undefined) {
      throw new SimStatesInvalidRequest(
        "UpdateStateMachine needs a definition or a roleArn to change.",
      );
    }

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
}

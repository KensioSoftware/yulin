import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimStateMachineAlreadyExists } from "../../error/sim-step-functions.error.js";
import { SimStateMachine } from "../../machine/sim-state-machine.js";
import { simStateMachineArn } from "../../machine/sim-state-machine-arn.js";
import type { SimStateMachineStore } from "../../machine/sim-state-machine-store.js";
import type {
  SimCreateStateMachineCommand,
  SimCreateStateMachineCommandOutput,
} from "./machine.command.js";
import { readSimStateMachineCreateInput } from "./sim-state-machine-input.js";

interface SimStateMachineCreateProperties {
  readonly stateMachines: SimStateMachineStore;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
}

/**
 * The command that creates a state machine.
 */
export class SimStateMachineCreate {
  readonly #stateMachines: SimStateMachineStore;
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #background: BackgroundScheduler;

  constructor(properties: SimStateMachineCreateProperties) {
    this.#stateMachines = properties.stateMachines;
    this.#accountRegionScope = properties.accountRegionScope;
    this.#background = properties.background;
  }

  /**
   * Create a state machine, checking its definition as it is read.
   *
   * A definition using something this simulator does not run is refused here
   * rather than when an execution reaches the state, which is where real Step
   * Functions refuses a malformed one too.
   */
  handle(
    command: SimCreateStateMachineCommand,
  ): SimCreateStateMachineCommandOutput {
    const read = readSimStateMachineCreateInput(command.input);

    if (this.#stateMachines.findByName(read.name) !== undefined) {
      throw new SimStateMachineAlreadyExists(
        `A state machine called ${read.name} is already there.`,
      );
    }

    const creationDate = this.#background.now();
    const stateMachine = new SimStateMachine({
      arn: simStateMachineArn(this.#accountRegionScope, read.name),
      creationDate,
      ...read,
    });

    this.#stateMachines.add(stateMachine);

    return { stateMachineArn: stateMachine.arn, creationDate };
  }
}

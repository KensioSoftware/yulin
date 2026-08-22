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
import {
  type SimStateMachineCreateInput,
  readSimStateMachineCreateInput,
} from "./sim-state-machine-input.js";

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
   *
   * `CreateStateMachine` is idempotent. A second request carrying the same
   * name, definition and type answers with the state machine that is already
   * there.
   */
  handle(
    command: SimCreateStateMachineCommand,
  ): SimCreateStateMachineCommandOutput {
    const read = readSimStateMachineCreateInput(command.input);
    const existing = this.#stateMachines.findByName(read.name);

    if (existing !== undefined) {
      return answerForExisting(existing, read);
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

/**
 * Answer a repeat request for a state machine that is already there.
 *
 * The idempotency check reads the name, the definition and the type. A request
 * differing only in its `roleArn` is idempotent too, and real Step Functions
 * leaves the role as it was. Its API reference contradicts itself on that
 * point, listing a differing role ARN under `StateMachineAlreadyExists` while
 * the operation's own note says the difference is ignored. The note is the
 * more specific of the two and is followed here.
 */
function answerForExisting(
  existing: SimStateMachine,
  read: SimStateMachineCreateInput,
): SimCreateStateMachineCommandOutput {
  if (existing.definition !== read.definition || existing.type !== read.type) {
    throw new SimStateMachineAlreadyExists(
      `A state machine called ${read.name} is already there, with a ` +
        "different definition or type.",
    );
  }

  return {
    stateMachineArn: existing.arn,
    creationDate: existing.creationDate,
  };
}

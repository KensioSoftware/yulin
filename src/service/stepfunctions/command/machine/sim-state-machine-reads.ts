import type { SimStateMachineStore } from "../../machine/sim-state-machine-store.js";
import type {
  SimDescribeStateMachineCommand,
  SimDescribeStateMachineCommandOutput,
  SimListStateMachinesCommand,
  SimListStateMachinesCommandOutput,
} from "./machine.command.js";
import { SimStatesInvalidRequest } from "../../error/sim-step-functions.error.js";
import { requireSimStateMachine } from "./sim-state-machine-lookup.js";

/**
 * The commands that read state machines back.
 */
export class SimStateMachineReads {
  readonly #stateMachines: SimStateMachineStore;

  constructor(stateMachines: SimStateMachineStore) {
    this.#stateMachines = stateMachines;
  }

  /**
   * Read one state machine back.
   */
  describe(
    command: SimDescribeStateMachineCommand,
  ): SimDescribeStateMachineCommandOutput {
    const found = requireSimStateMachine(
      this.#stateMachines,
      command.input.stateMachineArn,
      "DescribeStateMachine",
    );

    return {
      stateMachineArn: found.arn,
      name: found.name,
      status: "ACTIVE",
      definition: found.definition,
      roleArn: found.roleArn,
      type: found.type,
      creationDate: found.creationDate,
    };
  }

  /**
   * List the state machines this scope holds.
   */
  list(
    command: SimListStateMachinesCommand,
  ): SimListStateMachinesCommandOutput {
    const { maxResults } = command.input;

    if (
      maxResults !== undefined &&
      (!Number.isSafeInteger(maxResults) || maxResults < 0 || maxResults > 1000)
    ) {
      throw new SimStatesInvalidRequest(
        `maxResults is ${String(maxResults)}. It is a whole number from 0 to 1000.`,
      );
    }

    const all = this.#stateMachines.all();
    const wanted =
      maxResults === undefined || maxResults === 0
        ? all
        : all.slice(0, maxResults);

    return {
      stateMachines: wanted.map((found) => ({
        stateMachineArn: found.arn,
        name: found.name,
        type: found.type,
        creationDate: found.creationDate,
      })),
    };
  }
}

import type { SimStatesExecutionStore } from "../../execution/sim-states-execution-store.js";
import type { SimStateMachineStore } from "../../machine/sim-state-machine-store.js";
import type { SimStepFunctionsAuthorizer } from "../authorize/sim-step-functions-authorizer.js";
import type { SimStepFunctionsRequestOptions } from "../sim-step-functions-request-options.js";
import type {
  SimDeleteStateMachineCommand,
  SimDeleteStateMachineCommandOutput,
} from "./machine.command.js";
import {
  requireSimStateMachine,
  requiredSimStateMachineArn,
} from "./sim-state-machine-lookup.js";

interface SimStateMachineDeleteProperties {
  readonly stateMachines: SimStateMachineStore;
  readonly authorizer: SimStepFunctionsAuthorizer;
  readonly executions: SimStatesExecutionStore;
}

/**
 * The command that deletes a state machine.
 */
export class SimStateMachineDelete {
  readonly #stateMachines: SimStateMachineStore;
  readonly #authorizer: SimStepFunctionsAuthorizer;
  readonly #executions: SimStatesExecutionStore;

  constructor(properties: SimStateMachineDeleteProperties) {
    this.#stateMachines = properties.stateMachines;
    this.#authorizer = properties.authorizer;
    this.#executions = properties.executions;
  }

  /**
   * Delete a state machine and forget its executions.
   *
   * The caller is authorized against the ARN the request carries, before
   * anything is looked up. A caller with no permission is refused whether or
   * not the ARN names a state machine.
   */
  handle(
    command: SimDeleteStateMachineCommand,
    options?: SimStepFunctionsRequestOptions,
  ): SimDeleteStateMachineCommandOutput {
    const { stateMachineArn } = command.input;

    this.#authorizer.authorizeStateMachineArn(
      "states:DeleteStateMachine",
      requiredSimStateMachineArn(stateMachineArn, "DeleteStateMachine"),
      options?.caller,
    );

    const { arn } = requireSimStateMachine(
      this.#stateMachines,
      stateMachineArn,
      "DeleteStateMachine",
    );

    this.#stateMachines.remove(arn);
    this.#executions.removeForStateMachine(arn);

    return {};
  }
}

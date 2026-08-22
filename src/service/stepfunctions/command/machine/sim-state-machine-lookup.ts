import {
  SimStatesInvalidRequest,
  SimStatesResourceNotFound,
} from "../../error/sim-step-functions.error.js";
import type { SimStateMachine } from "../../machine/sim-state-machine.js";
import type { SimStateMachineStore } from "../../machine/sim-state-machine-store.js";

/**
 * Find the state machine a request's ARN names, or say why it could not be.
 */
export function requireSimStateMachine(
  stateMachines: SimStateMachineStore,
  arn: string | undefined,
  commandName: string,
): SimStateMachine {
  if (arn === undefined) {
    throw new SimStatesInvalidRequest(
      `${commandName} needs a stateMachineArn.`,
    );
  }

  const stateMachine = stateMachines.find(arn);

  if (stateMachine === undefined) {
    throw new SimStatesResourceNotFound(
      `${arn} is not a simulated state machine in this Account and Region.`,
    );
  }

  return stateMachine;
}

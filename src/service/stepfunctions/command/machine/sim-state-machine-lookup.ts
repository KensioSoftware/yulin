import {
  SimStatesInvalidRequest,
  SimStatesResourceNotFound,
} from "../../error/sim-step-functions.error.js";
import type { SimStateMachine } from "../../machine/sim-state-machine.js";
import type { SimStateMachineStore } from "../../machine/sim-state-machine-store.js";

/**
 * The state machine ARN a request names, or a refusal saying it needs one.
 *
 * A command authorizes against this before looking anything up, the way real
 * IAM decides a request before the service handles it.
 */
export function requiredSimStateMachineArn(
  arn: string | undefined,
  commandName: string,
): string {
  if (arn === undefined) {
    throw new SimStatesInvalidRequest(
      `${commandName} needs a stateMachineArn.`,
    );
  }

  return arn;
}

/**
 * Find the state machine a request's ARN names, or say why it could not be.
 */
export function requireSimStateMachine(
  stateMachines: SimStateMachineStore,
  arn: string | undefined,
  commandName: string,
): SimStateMachine {
  const stateMachine = stateMachines.find(
    requiredSimStateMachineArn(arn, commandName),
  );

  if (stateMachine === undefined) {
    throw new SimStatesResourceNotFound(
      `${arn} is not a simulated state machine in this Account and Region.`,
    );
  }

  return stateMachine;
}

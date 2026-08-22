import { parseSimStatesDefinition } from "../../definition/sim-states-definition-parse.js";
import type { SimStatesDefinition } from "../../definition/sim-states-definition.js";
import { SimStatesInvalidRequest } from "../../error/sim-step-functions.error.js";
import type { SimStateMachineType } from "../../machine/sim-state-machine.js";
import { checkSimStatesName } from "../../machine/sim-states-name.js";
import type * as commands from "./machine.command.js";

/**
 * What a CreateStateMachine request has to carry, once it has been checked.
 */
export interface SimStateMachineCreateInput {
  readonly name: string;
  readonly definition: string;
  readonly parsed: SimStatesDefinition;
  readonly roleArn: string;
  readonly type: SimStateMachineType;
}

/**
 * Check a CreateStateMachine request and read its definition.
 */
export function readSimStateMachineCreateInput(
  input: commands.SimCreateStateMachineCommandInput,
): SimStateMachineCreateInput {
  const { name, definition, roleArn, type } = input;

  if (name === undefined || name === "") {
    throw new SimStatesInvalidRequest("CreateStateMachine needs a name.");
  }

  if (definition === undefined) {
    throw new SimStatesInvalidRequest("CreateStateMachine needs a definition.");
  }

  if (roleArn === undefined) {
    throw new SimStatesInvalidRequest("CreateStateMachine needs a roleArn.");
  }

  return {
    name: checkSimStatesName(name, "The state machine name"),
    definition,
    parsed: parseSimStatesDefinition(definition),
    roleArn,
    type: readSimStateMachineType(type),
  };
}

/**
 * Read the state machine type a request asked for.
 */
export function readSimStateMachineType(
  type: string | undefined,
): SimStateMachineType {
  if (type === undefined || type === "STANDARD") {
    return "STANDARD";
  }

  if (type === "EXPRESS") {
    return "EXPRESS";
  }

  throw new SimStatesInvalidRequest(
    `${type} is not a state machine type. It is STANDARD or EXPRESS.`,
  );
}

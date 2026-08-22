import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import {
  SimStatesInvalidDefinition,
  SimStatesUnsimulatedInput,
} from "../error/sim-step-functions.error.js";
import {
  type SimStatesState,
  simStatesRunnableTypes,
  simStatesStateTypes,
} from "./sim-states-state.js";

// Real Step Functions gives a Fail state no input or output processing at all,
// and gives a Succeed state only the two paths.
const stateFieldsRefused = new Map<string, readonly string[]>([
  [
    "Fail",
    ["InputPath", "OutputPath", "Parameters", "ResultPath", "ResultSelector"],
  ],
  ["Succeed", ["Parameters", "ResultPath", "ResultSelector"]],
]);

/**
 * Check one state's type, and the fields that type is allowed.
 */
export function parseSimStatesState(
  name: string,
  state: JSONValue,
): SimStatesState {
  if (!isRecord(state)) {
    throw new SimStatesInvalidDefinition(`The state ${name} is not an object.`);
  }

  const type = state["Type"];

  if (typeof type !== "string") {
    throw new SimStatesInvalidDefinition(`The state ${name} has no Type.`);
  }

  if (!simStatesStateTypes.includes(type as never)) {
    throw new SimStatesInvalidDefinition(
      `The state ${name} has a Type of ${type}, which Amazon States Language ` +
        "does not define.",
    );
  }

  if (!simStatesRunnableTypes.includes(type as never)) {
    throw new SimStatesUnsimulatedInput(
      `The state ${name} is a ${type} state, which this simulator does not ` +
        `run yet. It runs ${simStatesRunnableTypes.join(", ")}.`,
    );
  }

  checkRefusedFields(name, type, state);

  return state as unknown as SimStatesState;
}

/**
 * Refuse the fields a state's type does not have.
 *
 * A definition carrying one of these would behave differently here than it
 * does on AWS, where the field is simply not part of the state.
 */
function checkRefusedFields(
  name: string,
  type: string,
  state: Record<string, JSONValue>,
): void {
  const refused = stateFieldsRefused.get(type) ?? [];
  const present = refused.filter((field) => Object.hasOwn(state, field));

  if (present.length > 0) {
    throw new SimStatesInvalidDefinition(
      `The ${type} state ${name} carries ${present.join(", ")}, which a ` +
        `${type} state does not have.`,
    );
  }
}

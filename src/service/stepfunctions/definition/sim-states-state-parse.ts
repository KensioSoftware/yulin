import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import {
  checkSimStatesChoiceDefault,
  parseSimStatesChoices,
} from "../choice/sim-states-choice-parse.js";
import {
  SimStatesInvalidDefinition,
  SimStatesUnsimulatedInput,
} from "../error/sim-step-functions.error.js";
import { checkSimStatesWaitFields } from "../wait/sim-states-wait-fields.js";
import {
  type SimStatesChoiceState,
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
  // A Choice state and a Wait state produce no result of their own, so they
  // carry the two paths and nothing that reshapes a result.
  ["Choice", ["Parameters", "ResultPath", "ResultSelector"]],
  ["Wait", ["Parameters", "ResultPath", "ResultSelector"]],
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
  checkTransitionFields(name, state);

  if (type === "Choice") {
    return readChoiceState(name, state);
  }

  if (type === "Wait") {
    checkSimStatesWaitFields(name, state);
  }

  return state as unknown as SimStatesState;
}

/**
 * Read a `Choice` state, whose rules are checked and built as it is read.
 *
 * The rules become the objects the state tests its input with, so a `Choice`
 * state that runs has already had its comparators, paths and operands read.
 */
function readChoiceState(
  name: string,
  state: Record<string, JSONValue>,
): SimStatesChoiceState {
  checkSimStatesChoiceDefault(name, state);

  return {
    ...(state as unknown as SimStatesChoiceState),
    Choices: parseSimStatesChoices(name, state),
  };
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

/**
 * Check the two fields that say what happens after a state.
 *
 * This runs on the state as it was written, before it is read as one of the
 * state types. Once it has been, `End` is a boolean as far as the compiler is
 * concerned, and a definition carrying `"true"` would be taken at its word.
 */
function checkTransitionFields(
  name: string,
  state: Record<string, JSONValue>,
): void {
  const end = state["End"];

  if (end !== undefined && typeof end !== "boolean") {
    throw new SimStatesInvalidDefinition(
      `The state ${name} has an End that is not a boolean. Only true ends an ` +
        "execution there.",
    );
  }

  const next = state["Next"];

  if (next !== undefined && typeof next !== "string") {
    throw new SimStatesInvalidDefinition(
      `The state ${name} has a Next that is not a state name.`,
    );
  }
}

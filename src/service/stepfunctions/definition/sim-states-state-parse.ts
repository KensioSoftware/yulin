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
import { parseSimStatesCatchers } from "../retry/sim-states-catch-parse.js";
import { parseSimStatesRetriers } from "../retry/sim-states-retry-parse.js";
import { checkSimStatesTaskFields } from "../task/sim-states-task-fields.js";
import { parseSimStatesTaskResource } from "../task/sim-states-task-resource.js";
import { checkSimStatesWaitFields } from "../wait/sim-states-wait-fields.js";
import {
  checkSimStatesRefusedFields,
  checkSimStatesTransitionFields,
} from "./sim-states-state-fields.js";
import {
  type SimStatesChoiceState,
  type SimStatesState,
  type SimStatesTaskState,
  simStatesRunnableTypes,
  simStatesStateTypes,
} from "./sim-states-state.js";

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

  checkSimStatesRefusedFields(name, type, state);
  checkSimStatesTransitionFields(name, state);

  if (type === "Choice") {
    return readChoiceState(name, state);
  }

  if (type === "Task") {
    return readTaskState(name, state);
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
 * Read a `Task` state, whose `Resource` is read as the state is.
 *
 * The target becomes the object the state invokes through, so a `Task` state
 * that runs has already had its `Resource` and its `Parameters` read. Its
 * `Retry` and `Catch` are read the same way, leaving the intervals, the
 * attempt counts and the paths known before an execution reaches the state.
 */
function readTaskState(
  name: string,
  state: Record<string, JSONValue>,
): SimStatesTaskState {
  checkSimStatesTaskFields(name, state);

  const retriers = parseSimStatesRetriers(name, state);
  const catchers = parseSimStatesCatchers(name, state);

  return {
    ...(state as unknown as SimStatesTaskState),
    target: parseSimStatesTaskResource(name, state),
    ...(retriers !== undefined && { Retry: retriers }),
    ...(catchers !== undefined && { Catch: catchers }),
  };
}

import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";
import type { SimStatesDefinition } from "./sim-states-definition.js";
import type { SimStatesState } from "./sim-states-state.js";
import { parseSimStatesState } from "./sim-states-state-parse.js";
import { checkSimStatesTransitions } from "./sim-states-transitions.js";

/**
 * Read a state machine definition from the JSON string it was written as.
 *
 * A definition using anything this simulator does not run is refused whole,
 * naming the state and what it used. A state machine missing one state runs
 * wrong, and running wrong gives a passing test that lies.
 */
export function parseSimStatesDefinition(
  definition: string,
): SimStatesDefinition {
  const document = readDocument(definition);
  const states = readStates(document);
  const startAt = document["StartAt"];

  if (typeof startAt !== "string") {
    throw new SimStatesInvalidDefinition(
      "A state machine definition needs a StartAt naming the state it begins at.",
    );
  }

  if (!states.has(startAt)) {
    throw new SimStatesInvalidDefinition(
      `StartAt names ${startAt}, which is not one of this state machine's states.`,
    );
  }

  checkSimStatesTransitions(states);

  const comment = document["Comment"];

  return {
    ...(typeof comment === "string" && { Comment: comment }),
    StartAt: startAt,
    States: states,
  };
}

/**
 * Read the definition string as the JSON object it has to be.
 */
function readDocument(definition: string): Record<string, JSONValue> {
  let document: JSONValue;

  try {
    document = JSON.parse(definition) as JSONValue;
  } catch {
    throw new SimStatesInvalidDefinition(
      "The state machine definition is not JSON.",
    );
  }

  if (!isRecord(document)) {
    throw new SimStatesInvalidDefinition(
      "A state machine definition is a JSON object.",
    );
  }

  return document;
}

/**
 * Read every state, refusing the ones this simulator has no implementation
 * for.
 */
function readStates(
  document: Record<string, JSONValue>,
): ReadonlyMap<string, SimStatesState> {
  const declared = document["States"];

  if (!isRecord(declared) || Object.keys(declared).length === 0) {
    throw new SimStatesInvalidDefinition(
      "A state machine definition needs a States object holding at least one state.",
    );
  }

  const states = new Map<string, SimStatesState>();

  for (const [name, state] of Object.entries(declared)) {
    states.set(name, parseSimStatesState(name, state));
  }

  return states;
}

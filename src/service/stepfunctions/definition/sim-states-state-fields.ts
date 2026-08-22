import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";

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
 * Refuse the fields a state's type does not have.
 *
 * A definition carrying one of these would behave differently here than it
 * does on AWS, where the field is simply not part of the state.
 */
export function checkSimStatesRefusedFields(
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
export function checkSimStatesTransitionFields(
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

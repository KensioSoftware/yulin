import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import { parseSimStatesReadPath } from "../data/sim-states-context-path.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";

/**
 * Read what builds each iteration's input.
 *
 * `Parameters` is what `ItemSelector` used to be called, and a `Map` state
 * carrying both says the same thing twice.
 */
export function readSimStatesItemSelector(
  named: string,
  state: Record<string, JSONValue>,
  parameters: JSONValue | undefined,
): { ItemSelector?: JSONValue } {
  const selector = state["ItemSelector"];

  if (selector !== undefined && parameters !== undefined) {
    throw new SimStatesInvalidDefinition(
      `The ${named} carries both ItemSelector and Parameters. Parameters is ` +
        "the older spelling of ItemSelector, and a Map state carries one of " +
        "them.",
    );
  }

  // A field written as null is a Payload Template that is not an object, and
  // is refused below. Falling back to the other spelling would take it for a
  // Map state that carries neither.
  const written = selector === undefined ? parameters : selector;

  if (written === undefined) {
    return {};
  }

  if (!isRecord(written)) {
    throw new SimStatesInvalidDefinition(
      `The ${named} has an ItemSelector that is not an object. It is a ` +
        "Payload Template, which builds what each iteration is given.",
    );
  }

  return { ItemSelector: written };
}

/**
 * Read where the items come from, which is the whole input by default.
 */
export function readSimStatesItemsPath(
  named: string,
  state: Record<string, JSONValue>,
): { ItemsPath?: string } {
  const written = state["ItemsPath"];

  if (written === undefined) {
    return {};
  }

  if (typeof written !== "string") {
    throw new SimStatesInvalidDefinition(
      `The ${named} has an ItemsPath that is not a Reference Path.`,
    );
  }

  parseSimStatesReadPath(written);

  return { ItemsPath: written };
}

/**
 * Read how many iterations may run at once.
 */
export function readSimStatesMaxConcurrency(
  named: string,
  state: Record<string, JSONValue>,
): { MaxConcurrency?: number } {
  const written = state["MaxConcurrency"];

  if (written === undefined) {
    return {};
  }

  if (
    typeof written !== "number" ||
    !Number.isSafeInteger(written) ||
    written < 0
  ) {
    throw new SimStatesInvalidDefinition(
      `The ${named} has a MaxConcurrency of ${JSON.stringify(written)}. It ` +
        "is a whole number from 0, where 0 runs every iteration at once.",
    );
  }

  return { MaxConcurrency: written };
}

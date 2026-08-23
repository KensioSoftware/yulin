import {
  SimStatesInvalidDefinition,
  SimStatesUnsimulatedInput,
  SimStepFunctionsError,
} from "../error/sim-step-functions.error.js";

/**
 * The same refusal, saying which nested state machine raised it.
 *
 * A `Parallel` state's branch and a `Map` state's item processor are both
 * state machines written inside another one, and the refusal a state inside
 * one raises names that state alone. Two branches are free to use the same
 * state name, and without the position the two refusals would read alike.
 *
 * A nested definition using an unsimulated construct keeps that name, since it
 * is the one telling a reader that the definition is good and this simulator
 * is behind. Everything else is a fault in the definition.
 */
export function simStatesNestedRefusal(where: string, error: unknown): unknown {
  if (error instanceof SimStatesUnsimulatedInput) {
    return new SimStatesUnsimulatedInput(`${where}: ${error.message}`);
  }

  if (error instanceof SimStepFunctionsError) {
    return new SimStatesInvalidDefinition(`${where}: ${error.message}`);
  }

  return error;
}

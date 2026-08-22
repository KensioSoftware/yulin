import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";
import {
  type SimStatesState,
  isSimStatesTerminal,
} from "./sim-states-state.js";

/**
 * Check that every state either ends the execution or moves to one that
 * exists.
 *
 * A `Next` naming a state that is not there is a definition fault rather than
 * a runtime one, and real Step Functions refuses it at creation too.
 */
export function checkSimStatesTransitions(
  states: ReadonlyMap<string, SimStatesState>,
): void {
  for (const [name, state] of states) {
    if (isSimStatesTerminal(state)) {
      checkTerminal(name, state);
      continue;
    }

    checkTransition(name, state, states);
  }
}

/**
 * A terminal state ends the execution, so it names nothing to go to.
 */
function checkTerminal(name: string, state: SimStatesState): void {
  if ("Next" in state) {
    throw new SimStatesInvalidDefinition(
      `The ${state.Type} state ${name} carries a Next. A ${state.Type} state ` +
        "ends the execution.",
    );
  }
}

/**
 * Every other state moves on, by Next or by ending the execution itself.
 */
function checkTransition(
  name: string,
  state: SimStatesState,
  states: ReadonlyMap<string, SimStatesState>,
): void {
  const next = "Next" in state ? state.Next : undefined;
  const ends = "End" in state && state.End;

  if (next === undefined && !ends) {
    throw new SimStatesInvalidDefinition(
      `The state ${name} carries neither Next nor End, so nothing says what ` +
        "happens after it.",
    );
  }

  if (next !== undefined && ends) {
    throw new SimStatesInvalidDefinition(
      `The state ${name} carries both Next and End.`,
    );
  }

  if (next !== undefined && !states.has(next)) {
    throw new SimStatesInvalidDefinition(
      `The state ${name} moves to ${next}, which is not one of this state ` +
        "machine's states.",
    );
  }
}

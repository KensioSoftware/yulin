import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";
import {
  type SimStatesChoiceState,
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

    if (state.Type === "Choice") {
      checkChoice(name, state, states);
      continue;
    }

    checkTransition(name, state, states);
  }
}

/**
 * A terminal state ends the execution, so it carries neither field.
 */
function checkTerminal(name: string, state: SimStatesState): void {
  for (const field of ["Next", "End"]) {
    if (Object.hasOwn(state, field)) {
      throw new SimStatesInvalidDefinition(
        `The ${state.Type} state ${name} carries ${field}. A ${state.Type} ` +
          "state ends the execution and carries neither.",
      );
    }
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
  // `End` is already known to be a boolean: the state was checked as it was
  // read, before it was taken as one of the state types.
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

/**
 * A `Choice` state moves on through its rules rather than through `Next`.
 *
 * Amazon States Language gives a `Choice` state neither `Next` nor `End` of
 * its own. Every rule names where a match goes, and `Default` names where the
 * execution goes when no rule holds.
 */
function checkChoice(
  name: string,
  state: SimStatesChoiceState,
  states: ReadonlyMap<string, SimStatesState>,
): void {
  for (const field of ["Next", "End"]) {
    if (Object.hasOwn(state, field)) {
      throw new SimStatesInvalidDefinition(
        `The Choice state ${name} carries ${field}. A Choice state moves on ` +
          "through its Choices and its Default, and carries neither.",
      );
    }
  }

  for (const rule of state.Choices) {
    if (!states.has(rule.next)) {
      throw new SimStatesInvalidDefinition(
        `A rule in the Choice state ${name} moves to ${rule.next}, which is ` +
          "not one of this state machine's states.",
      );
    }
  }

  if (state.Default !== undefined && !states.has(state.Default)) {
    throw new SimStatesInvalidDefinition(
      `The Choice state ${name} has a Default of ${state.Default}, which is ` +
        "not one of this state machine's states.",
    );
  }
}

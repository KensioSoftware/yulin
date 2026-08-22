import type { SimStatesState } from "./sim-states-state.js";

/**
 * One state machine's Amazon States Language definition, after it has been
 * read and checked.
 *
 * A definition is checked once, when the state machine is created. An
 * execution walks a definition it can rely on, which keeps the state types
 * out of the interpreter's error handling.
 */
export interface SimStatesDefinition {
  readonly Comment?: string;
  readonly StartAt: string;
  readonly States: ReadonlyMap<string, SimStatesState>;
}

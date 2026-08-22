import type { SimStatesDefinition } from "../definition/sim-states-definition.js";
import type { SimStatesState } from "../definition/sim-states-state.js";
import {
  simStatesCycleFailure,
  simStatesMaximumTransitions,
  simStatesUnknownStateFailure,
} from "./sim-states-failure.js";
import type { SimStatesSettlement } from "./sim-states-settlement.js";

/**
 * The states one walk steps through, and how many steps it may take.
 *
 * Amazon States Language allows a cycle, so a walk can run out of steps rather
 * than reaching an end. Both that and a transition naming nothing end the walk
 * here, which leaves the interpreter with the states that do exist.
 */
export class SimStatesWalkSteps {
  readonly #definition: SimStatesDefinition;
  readonly #settlement: SimStatesSettlement;

  /**
   * Transitions made so far, counted across every pause the clock makes.
   */
  #taken = 0;

  constructor(
    definition: SimStatesDefinition,
    settlement: SimStatesSettlement,
  ) {
    this.#definition = definition;
    this.#settlement = settlement;
  }

  /**
   * The state a name stands for, failing the walk where there is none.
   */
  next(current: string): SimStatesState | undefined {
    if (this.#taken++ >= simStatesMaximumTransitions) {
      this.#settlement.settle(simStatesCycleFailure());
      return undefined;
    }

    const state = this.#definition.States.get(current);

    if (state === undefined) {
      this.#settlement.settle(simStatesUnknownStateFailure(current));
    }

    return state;
  }
}

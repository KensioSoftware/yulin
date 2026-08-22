import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesDefinition } from "../definition/sim-states-definition.js";
import type { SimStatesState } from "../definition/sim-states-state.js";
import type { SimStatesTaskTargets } from "../task/sim-states-task-invocation.js";
import type { SimStatesExecution } from "./sim-states-execution.js";
import {
  simStatesCycleFailure,
  simStatesMaximumTransitions,
  simStatesUnknownStateFailure,
} from "./sim-states-failure.js";
import { SimStatesSettlement } from "./sim-states-settlement.js";
import { SimStatesStateAttempts } from "./sim-states-state-attempts.js";
import { SimStatesStateRunner } from "./sim-states-state-runner.js";

interface SimStatesInterpreterProperties {
  readonly definition: SimStatesDefinition;
  readonly execution: SimStatesExecution;
  readonly background: BackgroundScheduler;

  /**
   * Where a `Task` state does its work.
   */
  readonly tasks: SimStatesTaskTargets;

  /**
   * The state machine's execution role, which a task assumes.
   */
  readonly roleArn: string;
}

/**
 * Walks one execution through its state machine.
 *
 * The walk is a loop over a map of states, which is all Amazon States Language
 * asks for. Everything interesting happens either side of a state, in the
 * data-flow fields.
 *
 * A `Wait` state pauses the walk rather than blocking it. The rest of it is
 * scheduled on the simulation's clock, so the execution stays `RUNNING` until
 * something moves simulated time to the instant it is waiting for. A `Retry`
 * pauses it the same way, with the next attempt at the state standing in for
 * the state after it.
 */
export class SimStatesInterpreter {
  readonly #definition: SimStatesDefinition;
  readonly #execution: SimStatesExecution;
  readonly #background: BackgroundScheduler;
  readonly #settlement: SimStatesSettlement;
  readonly #attempts: SimStatesStateAttempts;

  /**
   * Transitions made so far, counted across every pause the clock makes.
   */
  #taken = 0;

  constructor(properties: SimStatesInterpreterProperties) {
    this.#definition = properties.definition;
    this.#execution = properties.execution;
    this.#background = properties.background;
    this.#settlement = new SimStatesSettlement({
      execution: properties.execution,
      background: properties.background,
    });
    this.#attempts = new SimStatesStateAttempts({
      runner: new SimStatesStateRunner({
        execution: properties.execution,
        background: properties.background,
        tasks: properties.tasks,
        roleArn: properties.roleArn,
      }),
      settlement: this.#settlement,
      background: properties.background,
      walkOn: async (outcome): Promise<void> => {
        await this.#walk(outcome.next, outcome.output);
      },
    });
  }

  /**
   * Run the execution as far as it goes without waiting on the clock.
   *
   * A failure ends the execution and is recorded on it. Nothing raises out of
   * here, since this runs where a caller advancing the clock would otherwise
   * see the raise.
   */
  async run(): Promise<void> {
    await this.#walk(this.#definition.StartAt, this.#execution.input);
  }

  /**
   * Walk from one state until the execution ends or the clock pauses it.
   */
  async #walk(from: string, value: JSONValue): Promise<void> {
    let current = from;
    let carried = value;

    for (;;) {
      const state = this.#nextState(current);

      if (state === undefined) {
        return;
      }

      this.#execution.enter(current);
      // One sequencing point per state. The states are a chain, so there is
      // nothing here to run in parallel.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await this.#background.sequence();

      // One state at a time, since each one's input is what the state before
      // it produced.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const carrying = await this.#attempts.run({
        name: current,
        state,
        input: carried,
      });

      if (carrying === undefined) {
        return;
      }

      carried = carrying.output;
      current = carrying.next;
    }
  }

  /**
   * The state a name stands for, failing the execution where there is none.
   */
  #nextState(current: string): SimStatesState | undefined {
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

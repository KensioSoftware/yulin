import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesDefinition } from "../definition/sim-states-definition.js";
import type { SimStatesChildWalk } from "./sim-states-child-walk.js";
import type { SimStatesRunRecord } from "./sim-states-run-record.js";
import type { SimStatesWalkContext } from "./sim-states-state-outcome.js";
import { SimStatesSettlement } from "./sim-states-settlement.js";
import { SimStatesStateAttempts } from "./sim-states-state-attempts.js";
import { SimStatesStateRunner } from "./sim-states-state-runner.js";
import { SimStatesWalkSteps } from "./sim-states-walk-steps.js";

interface SimStatesInterpreterProperties {
  readonly definition: SimStatesDefinition;
  readonly background: BackgroundScheduler;

  /**
   * What every state of this walk is given, the record it writes itself on
   * included.
   */
  readonly walk: SimStatesWalkContext;

  /**
   * What to do once this walk has ended, which is how a branch tells the
   * `Parallel` state holding it.
   */
  readonly onSettled?: () => Promise<void>;
}

/**
 * Walks one execution, or one branch of one, through its states.
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
 *
 * A `Parallel` state runs a walk of its own per branch, on the same clock and
 * through the same states, so a branch waits the way anything else does and
 * its siblings carry on while it does.
 */
export class SimStatesInterpreter implements SimStatesChildWalk {
  readonly #definition: SimStatesDefinition;
  readonly #record: SimStatesRunRecord;
  readonly #background: BackgroundScheduler;
  readonly #steps: SimStatesWalkSteps;
  readonly #attempts: SimStatesStateAttempts;
  readonly #onSettled: (() => Promise<void>) | undefined;

  /**
   * Whether whatever is holding this walk has been told it ended.
   */
  #told = false;

  constructor(properties: SimStatesInterpreterProperties) {
    this.#definition = properties.definition;
    this.#record = properties.walk.record;
    this.#background = properties.background;
    this.#onSettled = properties.onSettled;

    const settlement = new SimStatesSettlement({
      record: properties.walk.record,
      background: properties.background,
    });

    this.#steps = new SimStatesWalkSteps(properties.definition, settlement);
    this.#attempts = new SimStatesStateAttempts({
      runner: new SimStatesStateRunner({
        background: properties.background,
        walk: properties.walk,
      }),
      settlement,
      background: properties.background,
      walkOn: async (outcome): Promise<void> => {
        if (outcome !== undefined) {
          await this.#walk(outcome.next, outcome.output);
        }

        await this.#ended();
      },
    });
  }

  /**
   * Run the walk as far as it goes without waiting on the clock.
   *
   * A failure ends the execution and is recorded on it. Nothing raises out of
   * here, since this runs where a caller advancing the clock would otherwise
   * see the raise.
   */
  async run(): Promise<void> {
    await this.#walk(this.#definition.StartAt, this.#record.input);
    await this.#ended();
  }

  /**
   * Walk from one state until the walk ends or the clock pauses it.
   */
  async #walk(from: string, value: JSONValue): Promise<void> {
    let current = from;
    let carried = value;

    while (!this.#record.stopped) {
      const state = this.#steps.next(current);

      if (state === undefined) {
        return;
      }

      this.#record.enter(current);
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
   * Tell whatever is holding this walk that it is over, once it is.
   *
   * A walk that answered with states still on the clock is not over, and this
   * runs again when they release it.
   */
  async #ended(): Promise<void> {
    if (this.#told || !this.#record.stopped) {
      return;
    }

    this.#told = true;

    await this.#onSettled?.();
  }
}

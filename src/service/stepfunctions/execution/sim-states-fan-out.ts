import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesChildKind } from "./sim-states-child.js";
import { simStatesChildFailure } from "./sim-states-child-failure.js";
import type { SimStatesChildRun } from "./sim-states-child-run.js";
import {
  type SimStatesChildStart,
  SimStatesChildRuns,
} from "./sim-states-child-runs.js";
import { simStatesFailureFrom } from "./sim-states-failure.js";
import type {
  SimStatesFailOutcome,
  SimStatesSettledOutcome,
  SimStatesStateContext,
  SimStatesStateOutcome,
} from "./sim-states-state-outcome.js";

interface SimStatesFanOutProperties {
  readonly kind: SimStatesChildKind;
  readonly context: SimStatesStateContext;
  readonly children: readonly SimStatesChildStart[];

  /**
   * How many children may be running at once.
   */
  readonly limit: number;

  /**
   * What one child is called, for the failure the state ends with.
   */
  readonly names: (index: number) => string;

  /**
   * What the state answers, given what every child produced in child order.
   */
  readonly answers: (outputs: readonly JSONValue[]) => SimStatesSettledOutcome;
}

/**
 * Runs the children of one state, and says what the state made of them.
 *
 * A child that reaches a `Wait` state is left on the clock rather than waited
 * for, so its siblings run while it waits. The state itself suspends when any
 * of them does, and answers through the walk's `resume` once the last one has
 * finished.
 *
 * A child that fails takes the state with it. The siblings still going are
 * abandoned, which leaves whatever they had scheduled on the clock to find a
 * child that has stopped.
 */
export class SimStatesFanOut {
  readonly #context: SimStatesStateContext;
  readonly #names: (index: number) => string;
  readonly #answers: (outputs: readonly JSONValue[]) => SimStatesSettledOutcome;
  readonly #children: SimStatesChildRuns;
  #failure: SimStatesFailOutcome | undefined;

  /**
   * Whether the state has told the walk that it suspended, and so owes it an
   * answer through `resume`.
   */
  #suspended = false;

  constructor(properties: SimStatesFanOutProperties) {
    this.#context = properties.context;
    this.#names = properties.names;
    this.#answers = properties.answers;
    this.#children = new SimStatesChildRuns({
      kind: properties.kind,
      context: properties.context,
      children: properties.children,
      limit: properties.limit,
      onSettled: async (run): Promise<void> => {
        await this.#settled(run);
      },
    });
  }

  /**
   * Start the children, and say what the state did as far as they have got.
   *
   * Everything that answers without waiting on the clock has answered by the
   * time this does, so a fan-out with nothing to wait for never suspends.
   */
  async run(): Promise<SimStatesStateOutcome> {
    await this.#children.start();

    const outcome = this.#outcome();

    if (outcome !== undefined) {
      return outcome;
    }

    this.#suspended = true;

    return { kind: "pending" };
  }

  /**
   * Take in that one child has ended, and carry on from there.
   */
  async #settled(run: SimStatesChildRun): Promise<void> {
    if (this.#failure !== undefined) {
      return;
    }

    this.#children.ended();

    const failure = run.failure;

    if (failure !== undefined) {
      this.#failure = simStatesChildFailure(this.#names(run.index), failure);
      this.#children.abandon();
    }

    await this.#children.start();
    await this.#resumed();
  }

  /**
   * Answer the walk, where the state suspended and is now done.
   */
  async #resumed(): Promise<void> {
    if (!this.#suspended) {
      return;
    }

    const outcome = this.#outcome();

    if (outcome === undefined) {
      return;
    }

    this.#suspended = false;

    await this.#context.resume(outcome);
  }

  /**
   * What the state did, where its children are done enough to say.
   */
  #outcome(): SimStatesSettledOutcome | undefined {
    if (this.#failure !== undefined) {
      return this.#failure;
    }

    if (!this.#children.finished) {
      return undefined;
    }

    try {
      return this.#answers(this.#children.outputs);
    } catch (error) {
      // A ResultPath with nowhere to write fails the state rather than the
      // clock advance that released the last child.
      return simStatesFailureFrom(error);
    }
  }
}

import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimStatesDefinition } from "../definition/sim-states-definition.js";
import type { SimStatesChildKind } from "./sim-states-child.js";
import { SimStatesChildRun } from "./sim-states-child-run.js";
import type { SimStatesStateContext } from "./sim-states-state-outcome.js";

/**
 * One child of a state that runs states of its own, before it is started.
 */
export interface SimStatesChildStart {
  readonly index: number;
  readonly definition: SimStatesDefinition;
  readonly input: JSONValue;
}

interface SimStatesChildRunsProperties {
  readonly kind: SimStatesChildKind;
  readonly context: SimStatesStateContext;
  readonly children: readonly SimStatesChildStart[];

  /**
   * What to do once one child has ended.
   */
  readonly onSettled: (run: SimStatesChildRun) => Promise<void>;
}

/**
 * The children one state runs.
 *
 * A child that reaches a `Wait` state is left on the clock rather than waited
 * for. Its siblings start alongside it.
 */
export class SimStatesChildRuns {
  readonly #kind: SimStatesChildKind;
  readonly #context: SimStatesStateContext;
  readonly #onSettled: (run: SimStatesChildRun) => Promise<void>;

  /**
   * The children still to be started, in the order they were written.
   */
  readonly #waiting: SimStatesChildStart[];

  /**
   * The children that have been started, in the same order.
   */
  readonly #started: SimStatesChildRun[] = [];

  readonly #total: number;
  #ended = 0;

  constructor(properties: SimStatesChildRunsProperties) {
    this.#kind = properties.kind;
    this.#context = properties.context;
    this.#onSettled = properties.onSettled;
    this.#waiting = [...properties.children];
    this.#total = properties.children.length;
  }

  /**
   * Whether every child has ended.
   */
  get finished(): boolean {
    return this.#ended >= this.#total;
  }

  /**
   * What each child produced, in the order the children were written.
   */
  get outputs(): readonly JSONValue[] {
    return this.#started.map((run) => run.output);
  }

  /**
   * Start the next child, and the ones after it.
   *
   * A child is started once the one before it is either done or waiting on
   * the clock, since a child waiting is one the state is still running. The
   * children a failure leaves nothing to do are dropped from the queue, so
   * this answers as soon as one of them fails.
   */
  async start(): Promise<void> {
    const child = this.#waiting.shift();

    if (child === undefined) {
      return;
    }

    await this.#start(child);
    await this.start();
  }

  /**
   * Take in that one child has ended.
   */
  ended(): void {
    this.#ended += 1;
  }

  /**
   * Give up on the children a failure leaves nothing to do.
   */
  abandon(): void {
    this.#started.forEach((run) => {
      run.abandon();
    });
    this.#waiting.length = 0;
  }

  /**
   * Run one child as far as it goes without waiting on the clock.
   */
  async #start(child: SimStatesChildStart): Promise<void> {
    const run = new SimStatesChildRun({
      kind: this.#kind,
      stateName: this.#context.stateName,
      index: child.index,
      input: child.input,
      parent: this.#context.record,
    });

    this.#started.push(run);
    this.#context.record.child(run);

    await this.#context
      .walkChild({
        definition: child.definition,
        record: run,
        onSettled: async (): Promise<void> => {
          await this.#onSettled(run);
        },
      })
      .run();
  }
}

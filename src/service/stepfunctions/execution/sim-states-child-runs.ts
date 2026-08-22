import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
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

  /**
   * What the child's states read through `$$`.
   */
  readonly contextObject: JSONObject;
}

interface SimStatesChildRunsProperties {
  readonly kind: SimStatesChildKind;
  readonly context: SimStatesStateContext;
  readonly children: readonly SimStatesChildStart[];

  /**
   * How many children may be running at once. A state with no bound of its
   * own is given an infinite one.
   */
  readonly limit: number;

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
  readonly #limit: number;

  /**
   * The children still to be started, in the order they were written.
   */
  readonly #waiting: SimStatesChildStart[];

  /**
   * The children that have been started, in the same order.
   */
  readonly #started: SimStatesChildRun[] = [];

  readonly #total: number;
  #running = 0;
  #ended = 0;

  constructor(properties: SimStatesChildRunsProperties) {
    this.#kind = properties.kind;
    this.#context = properties.context;
    this.#onSettled = properties.onSettled;
    this.#limit = properties.limit;
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
   * Start the next child, and the ones after it there is room for.
   *
   * A child is started once the one before it is either done or waiting on
   * the clock, since a child waiting is one that is still running. This
   * answers where the bound is reached, and the children left over start as
   * the ones running end. The children a failure leaves nothing to do are
   * dropped from the queue, so this answers as soon as one of them fails.
   */
  async start(): Promise<void> {
    const child = this.#next();

    if (child === undefined) {
      return;
    }

    await this.#start(child);
    await this.start();
  }

  /**
   * Take in that one child has ended, which leaves room for another.
   */
  ended(): void {
    this.#running -= 1;
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
   * The next child to start, where there is room to start one.
   *
   * The room is arithmetic rather than a test, since a state with no bound
   * has an infinite one and takes the same subtraction.
   */
  #next(): SimStatesChildStart | undefined {
    return this.#waiting
      .splice(0, Math.min(1, this.#limit - this.#running))
      .at(0);
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

    this.#running += 1;
    this.#started.push(run);
    this.#context.record.child(run);

    await this.#context
      .walkChild({
        definition: child.definition,
        record: run,
        contextObject: child.contextObject,
        onSettled: async (): Promise<void> => {
          await this.#onSettled(run);
        },
      })
      .run();
  }
}

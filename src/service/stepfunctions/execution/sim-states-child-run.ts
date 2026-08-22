import type { JSONValue } from "../../../util/type-guard/json.js";
import type {
  SimStatesChild,
  SimStatesChildKind,
  SimStatesChildStatus,
} from "./sim-states-child.js";
import type { SimStatesRunRecord } from "./sim-states-run-record.js";
import type { SimStatesFailOutcome } from "./sim-states-state-outcome.js";

interface SimStatesChildRunProperties {
  readonly kind: SimStatesChildKind;
  readonly stateName: string;
  readonly index: number;
  readonly input: JSONValue;

  /**
   * The run the state holding this child belongs to, which is where a child
   * of its own is recorded.
   */
  readonly parent: SimStatesRunRecord;
}

/**
 * One branch of a `Parallel` state, as it runs.
 *
 * The states a branch visits are its own rather than the execution's, so they
 * are held here. A branch of a branch is still reported on the execution,
 * which is why a child run passes one it is told about upwards.
 */
export class SimStatesChildRun implements SimStatesRunRecord, SimStatesChild {
  readonly kind: SimStatesChildKind;
  readonly stateName: string;
  readonly index: number;
  readonly input: JSONValue;

  /**
   * What the branch answered with, which is `null` until it has.
   */
  #output: JSONValue = null;
  #status: SimStatesChildStatus = "RUNNING";
  #failure: SimStatesFailOutcome | undefined;
  readonly #visited: string[] = [];
  readonly #children: SimStatesChildRun[] = [];
  readonly #parent: SimStatesRunRecord;

  constructor(properties: SimStatesChildRunProperties) {
    this.kind = properties.kind;
    this.stateName = properties.stateName;
    this.index = properties.index;
    this.input = properties.input;
    this.#parent = properties.parent;
  }

  get status(): SimStatesChildStatus {
    return this.#status;
  }

  get output(): JSONValue {
    return this.#output;
  }

  /**
   * What the branch failed with, where it failed.
   */
  get failure(): SimStatesFailOutcome | undefined {
    return this.#failure;
  }

  get error(): string | undefined {
    return this.#failure?.error;
  }

  get visitedStates(): readonly string[] {
    return [...this.#visited];
  }

  get stopped(): boolean {
    return this.#status !== "RUNNING";
  }

  enter(stateName: string): void {
    this.#visited.push(stateName);
  }

  attempt(stateName: string, error: string | undefined): void {
    this.#parent.attempt(stateName, error);
  }

  succeed(output: JSONValue): void {
    this.#status = "SUCCEEDED";
    this.#output = output;
  }

  fail(error: string, cause: string | undefined): void {
    this.#status = "FAILED";
    this.#failure = { kind: "fail", error, cause };
  }

  child(child: SimStatesChildRun): void {
    this.#children.push(child);
    this.#parent.child(child);
  }

  /**
   * Give up on this branch, because one of its siblings failed.
   *
   * Whatever it had scheduled on the clock still runs, and finds a branch that
   * has stopped rather than one to carry on with. The branches this one was
   * itself running are given up on too, however deep they go.
   */
  abandon(): void {
    if (this.stopped) {
      return;
    }

    this.#status = "ABANDONED";

    this.#children.forEach((child) => {
      child.abandon();
    });
  }
}

/**
 * Whether a child run is a `Parallel` state's branch or a `Map` state's
 * iteration.
 */
export type SimStatesChildKind = "branch" | "iteration";

/**
 * Where a child run got to.
 *
 * A child a sibling's failure stopped is `ABANDONED` rather than failed: it
 * was not the one that went wrong, and it never reached an end of its own.
 */
export type SimStatesChildStatus =
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "ABANDONED";

/**
 * One branch of a `Parallel` state, as an execution ran it.
 *
 * A branch runs states of its own, so what it did is held apart from the
 * states the execution around it visited. A test asserting that four records
 * were processed counts these.
 */
export interface SimStatesChild {
  readonly kind: SimStatesChildKind;

  /**
   * The `Parallel` state the child belongs to.
   */
  readonly stateName: string;

  /**
   * Where the child sits among its siblings, counting from zero.
   */
  readonly index: number;

  readonly status: SimStatesChildStatus;

  /**
   * The states the child entered, in the order it entered them.
   */
  readonly visitedStates: readonly string[];

  /**
   * What the child failed with, where it failed.
   */
  readonly error: string | undefined;
}

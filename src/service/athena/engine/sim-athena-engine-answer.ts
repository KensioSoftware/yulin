import type { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";

/**
 * What the engine came to for one query.
 *
 * A turn-down carries why, because a strict engine fails the query with it and
 * a reader of that failing test has to learn which of them it hit.
 */
export interface SimAthenaEngineAnswer {
  /** The rows, where the engine ran the statement. */
  readonly result: SimAthenaResolvedResult | undefined;

  /** What the engine could not do, where it turned the query down. */
  readonly turnedDown: string | undefined;

  /**
   * Why the query fails whether or not the engine is strict.
   *
   * That is a statement Athena refuses, or one the engine ran and could not
   * evaluate.
   */
  readonly rejected: string | undefined;
}

/** One answer the engine ran for real. */
export function simAthenaEngineAnswered(
  result: SimAthenaResolvedResult,
): SimAthenaEngineAnswer {
  return { result, turnedDown: undefined, rejected: undefined };
}

/** One query the engine turned down, and why. */
export function simAthenaEngineTurnedDown(
  turnedDown: string,
): SimAthenaEngineAnswer {
  return { result: undefined, turnedDown, rejected: undefined };
}

/**
 * One statement that fails whatever mode the engine is in, and why.
 *
 * Athena refusing the statement is one reason, and the alternative there is a
 * green test on SQL the service rejects. A function shim refusing a value is
 * the other, and the alternative there is a query losing every row in silence.
 */
export function simAthenaEngineRejected(
  rejected: string,
): SimAthenaEngineAnswer {
  return { result: undefined, turnedDown: undefined, rejected };
}

/** An engine nobody turned on, which has no opinion about the query. */
export function simAthenaEngineSilent(): SimAthenaEngineAnswer {
  return { result: undefined, turnedDown: undefined, rejected: undefined };
}

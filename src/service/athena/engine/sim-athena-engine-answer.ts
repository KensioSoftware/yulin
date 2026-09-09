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

  /** Why Athena refuses the statement, where the engine found it invalid. */
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
 * One statement Athena refuses, and why.
 *
 * The engine ran nothing. A query that reaches this fails whether or not the
 * engine is strict, since the alternative is a green test on SQL the service
 * rejects.
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

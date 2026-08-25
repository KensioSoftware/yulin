/**
 * Where one query execution has got to.
 */
export type SimAthenaQueryState =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

/**
 * The states a query has finished in, whichever way it went.
 */
const settledStates = new Set<SimAthenaQueryState>([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

/**
 * Whether a query in this state has finished.
 *
 * `StopQueryExecution` reaches a query that has not, and leaves one that has
 * alone, which is how real Athena answers a stop that arrived too late.
 */
export function isSettledQueryState(state: SimAthenaQueryState): boolean {
  return settledStates.has(state);
}

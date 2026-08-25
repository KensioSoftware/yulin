import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";
import type { SimAthenaQueryExecutionStore } from "../../execution/sim-athena-query-execution-store.js";
import type { SimAthenaQueryExecution } from "../../execution/sim-athena-query-execution.js";

/**
 * Give up on a query that has not finished.
 *
 * A query that already settled is left alone. Real Athena answers a stop that
 * arrived too late without changing anything, rather than failing, and the
 * execution itself is what holds that rule.
 */
export function stopQuery(
  executions: SimAthenaQueryExecutionStore,
  queryExecutionId: string | undefined,
  clock: SimClock,
  authorize: (execution: SimAthenaQueryExecution) => void,
): void {
  const execution = executions.require(requiredExecutionId(queryExecutionId));

  authorize(execution);
  execution.cancel(clock.now());
}

/**
 * Read the execution a request names.
 */
export function requiredExecutionId(
  queryExecutionId: string | undefined,
): string {
  if (queryExecutionId === undefined || queryExecutionId === "") {
    throw new SimAthenaInvalidRequestException("QueryExecutionId is required");
  }

  return queryExecutionId;
}

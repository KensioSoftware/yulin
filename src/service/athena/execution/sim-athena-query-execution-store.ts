import { SimAthenaInvalidRequestException } from "../error/sim-athena.error.js";
import type { SimAthenaQueryExecution } from "./sim-athena-query-execution.js";

/**
 * The query executions of one simulated Athena scope.
 */
export class SimAthenaQueryExecutionStore {
  private readonly executions = new Map<string, SimAthenaQueryExecution>();

  /**
   * Every execution in this scope, oldest first.
   */
  get all(): readonly SimAthenaQueryExecution[] {
    return this.executions.values().toArray();
  }

  /**
   * Store an execution.
   */
  put(execution: SimAthenaQueryExecution): void {
    this.executions.set(execution.queryExecutionId, execution);
  }

  /**
   * Find an execution by id.
   */
  find(queryExecutionId: string): SimAthenaQueryExecution | undefined {
    return this.executions.get(queryExecutionId);
  }

  /**
   * Resolve an execution by id, or refuse.
   */
  require(queryExecutionId: string): SimAthenaQueryExecution {
    const found = this.find(queryExecutionId);

    if (found === undefined) {
      throw new SimAthenaInvalidRequestException(
        `QueryExecution ${queryExecutionId} was not found`,
      );
    }

    return found;
  }
}
